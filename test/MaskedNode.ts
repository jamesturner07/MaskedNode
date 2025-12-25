import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { MaskedNode, MaskedNode__factory } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  delegate: HardhatEthersSigner;
  outsider: HardhatEthersSigner;
};

function maskMessage(message: string, maskAddress: string): string {
  const messageBytes = Buffer.from(message, "utf8");
  const maskBytes = Buffer.from(maskAddress.slice(2), "hex");
  const masked = Buffer.alloc(messageBytes.length);

  for (let i = 0; i < messageBytes.length; i++) {
    masked[i] = messageBytes[i] ^ maskBytes[i % maskBytes.length];
  }

  return `0x${masked.toString("hex")}`;
}

function unmaskMessage(masked: string, maskAddress: string): string {
  const maskedBytes = Buffer.from(masked.replace(/^0x/, ""), "hex");
  const maskBytes = Buffer.from(maskAddress.slice(2), "hex");
  const clear = Buffer.alloc(maskedBytes.length);

  for (let i = 0; i < maskedBytes.length; i++) {
    clear[i] = maskedBytes[i] ^ maskBytes[i % maskBytes.length];
  }

  return clear.toString("utf8");
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("MaskedNode")) as MaskedNode__factory;
  const contract = (await factory.deploy()) as MaskedNode;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("MaskedNode", function () {
  let signers: Signers;
  let contract: MaskedNode;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { owner: ethSigners[0], delegate: ethSigners[1], outsider: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("creates a node and lets the owner decrypt the mask to reveal the message", async function () {
    const maskAddress = ethers.Wallet.createRandom().address;
    const message = "masked hello world";
    const masked = maskMessage(message, maskAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(maskAddress)
      .encrypt();

    const tx = await contract
      .connect(signers.owner)
      .createNode(encryptedInput.handles[0], masked, encryptedInput.inputProof);
    await tx.wait();

    const [owner, encryptedMask, maskedMessage, createdAt] = await contract.getNode(1);
    expect(owner).to.eq(signers.owner.address);
    expect(maskedMessage).to.eq(masked);
    expect(createdAt).to.be.gt(0);

    const decryptedMask = await fhevm.userDecryptEaddress(encryptedMask, contractAddress, signers.owner);
    expect(decryptedMask).to.eq(maskAddress);

    const clearMessage = unmaskMessage(maskedMessage, decryptedMask);
    expect(clearMessage).to.eq(message);
  });

  it("allows the owner to grant decryption access to another user", async function () {
    const maskAddress = ethers.Wallet.createRandom().address;
    const message = "shareable secret";
    const masked = maskMessage(message, maskAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(maskAddress)
      .encrypt();

    await contract
      .connect(signers.owner)
      .createNode(encryptedInput.handles[0], masked, encryptedInput.inputProof);

    await expect(contract.connect(signers.delegate).grantAccess(1, signers.outsider.address)).to.be.revertedWithCustomError(
      contract,
      "NotNodeOwner",
    );

    await contract.connect(signers.owner).grantAccess(1, signers.delegate.address);

    const authorized = await contract.getAuthorizedAddresses(1);
    expect(authorized).to.include(signers.delegate.address);

    const node = await contract.getNode(1);
    const decryptedMaskByDelegate = await fhevm.userDecryptEaddress(node[1], contractAddress, signers.delegate);
    expect(decryptedMaskByDelegate).to.eq(maskAddress);
  });
});
