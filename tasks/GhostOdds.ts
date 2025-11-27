import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const CONTRACT_NAME = "GhostOdds";

task("task:game-address", "Prints the GhostOdds contract address").setAction(async (_args: TaskArguments, hre) => {
  const deployment = await hre.deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address is ${deployment.address}`);
});

task("task:join-game", "Swap ETH for encrypted points")
  .addParam("eth", "Amount of ETH to send in ether")
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const { ethers } = hre;
    const deployment = await hre.deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();

    const ethAmount = ethers.parseEther(taskArgs.eth);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const tx = await contract.connect(signer).joinGame({ value: ethAmount });
    console.log(`Joining game with ${taskArgs.eth} ETH... tx: ${tx.hash}`);
    await tx.wait();
    console.log("Deposit confirmed");
  });

task("task:start-round", "Starts a new dice round").setAction(async (_args: TaskArguments, hre) => {
  const { ethers } = hre;
  const deployment = await hre.deployments.get(CONTRACT_NAME);
  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

  const tx = await contract.connect(signer).startRound();
  console.log(`Starting round... tx: ${tx.hash}`);
  await tx.wait();
  console.log("Round started");
});

task("task:guess", "Submit an encrypted guess (1 for Big, 2 for Small)")
  .addParam("value", "Guess choice (1 => Big, 2 => Small)")
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const guess = parseInt(taskArgs.value);
    if (guess !== 1 && guess !== 2) {
      throw new Error("Guess must be 1 (Big) or 2 (Small)");
    }

    const deployment = await hre.deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encryptedGuess = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add32(guess)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    console.log(`Submitting guess ${guess}... tx: ${tx.hash}`);
    await tx.wait();
    console.log("Guess confirmed");
  });

task("task:decrypt-balance", "Decrypt the caller's encrypted point balance").setAction(
  async (_args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await hre.deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encryptedBalance = await contract.getPlayerBalance(signer.address);
    if (encryptedBalance === ethers.ZeroHash) {
      console.log("Balance is empty");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      deployment.address,
      signer,
    );
    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance.toString()} points`);
  },
);

task("task:decrypt-round", "Decrypts latest round dice, guess, and outcome").setAction(
  async (_args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await hre.deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const dice = await contract.getDiceResult(signer.address);
    const guess = await contract.getLastGuess(signer.address);
    const outcome = await contract.getLastOutcome(signer.address);

    if (dice === ethers.ZeroHash && guess === ethers.ZeroHash && outcome === ethers.ZeroHash) {
      console.log("No round history available.");
      return;
    }

    const decryptedDice = await fhevm.userDecryptEuint(FhevmType.euint32, dice, deployment.address, signer);
    const decryptedGuess = await fhevm.userDecryptEuint(FhevmType.euint32, guess, deployment.address, signer);
    const decryptedOutcome = await fhevm.userDecryptEuint(FhevmType.euint32, outcome, deployment.address, signer);

    console.log(`Dice: ${decryptedDice} | Guess: ${decryptedGuess} | Outcome (1=win,0=loss): ${decryptedOutcome}`);
  },
);
