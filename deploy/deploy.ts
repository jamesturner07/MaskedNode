import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedMaskedNode = await deploy("MaskedNode", {
    from: deployer,
    log: true,
  });

  console.log(`MaskedNode contract: `, deployedMaskedNode.address);
};
export default func;
func.id = "deploy_maskedNode"; // id required to prevent reexecution
func.tags = ["MaskedNode"];
