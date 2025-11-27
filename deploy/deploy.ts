import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedGhostOdds = await deploy("GhostOdds", {
    from: deployer,
    log: true,
  });

  console.log(`GhostOdds contract: `, deployedGhostOdds.address);
};
export default func;
func.id = "deploy_GhostOdds"; // id required to prevent reexecution
func.tags = ["GhostOdds"];
