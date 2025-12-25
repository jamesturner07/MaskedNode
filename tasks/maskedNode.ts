import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

function maskMessage(message: string, maskAddress: string): string {
  const messageBytes = Buffer.from(message, "utf8");
  const maskBytes = Buffer.from(maskAddress.slice(2), "hex");
  const masked = Buffer.alloc(messageBytes.length);

  for (let i = 0; i < messageBytes.length; i++) {
    masked[i] = messageBytes[i] ^ maskBytes[i % maskBytes.length];
  }

  return `0x${masked.toString("hex")}`;
}

task("task:address", "Prints the MaskedNode address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const contract = await deployments.get("MaskedNode");

  console.log("MaskedNode address is " + contract.address);
});

task("task:create-node", "Create a masked node with an encrypted mask address")
  .addParam("message", "Plaintext message to protect")
  .addOptionalParam("address", "Optionally specify the MaskedNode contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("MaskedNode");
    console.log(`MaskedNode: ${deployment.address}`);

    const [owner] = await ethers.getSigners();
    const maskAddress = ethers.Wallet.createRandom().address;
    const maskedMessage = maskMessage(taskArguments.message, maskAddress);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, owner.address)
      .addAddress(maskAddress)
      .encrypt();

    const contract = await ethers.getContractAt("MaskedNode", deployment.address);
    const tx = await contract
      .connect(owner)
      .createNode(encryptedInput.handles[0], maskedMessage, encryptedInput.inputProof);

    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log("Node created with mask", maskAddress);
  });

task("task:list-nodes", "List node ids for a given user")
  .addOptionalParam("user", "User address to inspect (default: first signer)")
  .addOptionalParam("address", "Optionally specify the MaskedNode contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("MaskedNode");
    const targetUser =
      taskArguments.user ||
      (await hre.ethers.getSigners())[0].address;

    const { ethers } = hre;

    const contract = await ethers.getContractAt("MaskedNode", deployment.address);
    const nodeIds: bigint[] = await contract.getNodeIds(targetUser);
    console.log(`Nodes for ${targetUser}: ${nodeIds.join(", ") || "none"}`);
  });

task("task:get-node", "Get node details by id")
  .addParam("nodeid", "Node id to inspect")
  .addOptionalParam("address", "Optionally specify the MaskedNode contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("MaskedNode");

    const contract = await hre.ethers.getContractAt("MaskedNode", deployment.address);
    const [owner, encryptedMask, maskedMessage, createdAt] = await contract.getNode(BigInt(taskArguments.nodeid));

    console.log("Node owner     :", owner);
    console.log("Encrypted mask :", encryptedMask);
    console.log("Masked message :", maskedMessage);
    console.log("Created at     :", new Date(Number(createdAt) * 1000).toISOString());
  });
