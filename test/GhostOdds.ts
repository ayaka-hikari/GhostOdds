import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import { GhostOdds, GhostOdds__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("GhostOdds")) as GhostOdds__factory;
  const contract = (await factory.deploy()) as GhostOdds;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("GhostOdds", function () {
  let signers: Signers;
  let ghostOdds: GhostOdds;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Skipping GhostOdds tests outside of the FHEVM mock environment");
      this.skip();
    }

    ({ contract: ghostOdds, contractAddress } = await deployFixture());
  });

  it("mints encrypted points when a player joins", async function () {
    const depositValue = ethers.parseEther("0.2"); // 2000 points
    await ghostOdds.connect(signers.alice).joinGame({ value: depositValue });

    const encryptedBalance = await ghostOdds.getPlayerBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      contractAddress,
      signers.alice,
    );

    expect(Number(clearBalance)).to.equal(2000);
  });

  it("starts a round and marks it active", async function () {
    const depositValue = ethers.parseEther("0.1");
    await ghostOdds.connect(signers.alice).joinGame({ value: depositValue });

    await ghostOdds.connect(signers.alice).startRound();

    const [isActive] = await ghostOdds.getRoundMetadata(signers.alice.address);
    expect(isActive).to.equal(true);
  });

  it("resolves a guess and updates encrypted state", async function () {
    const depositValue = ethers.parseEther("0.5"); // 5000 points
    await ghostOdds.connect(signers.alice).joinGame({ value: depositValue });

    const balanceBefore = await ghostOdds.getPlayerBalance(signers.alice.address);
    const clearBalanceBefore = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      balanceBefore,
      contractAddress,
      signers.alice,
    );

    await ghostOdds.connect(signers.alice).startRound();

    const encryptedGuess = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    await ghostOdds
      .connect(signers.alice)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);

    const lastGuessCipher = await ghostOdds.getLastGuess(signers.alice.address);
    const lastOutcomeCipher = await ghostOdds.getLastOutcome(signers.alice.address);
    const balanceAfter = await ghostOdds.getPlayerBalance(signers.alice.address);
    const [, hasHistory] = await ghostOdds.getRoundMetadata(signers.alice.address);

    const lastGuess = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      lastGuessCipher,
      contractAddress,
      signers.alice,
    );
    const lastOutcome = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      lastOutcomeCipher,
      contractAddress,
      signers.alice,
    );
    const clearBalanceAfter = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      balanceAfter,
      contractAddress,
      signers.alice,
    );

    expect(Number(lastGuess)).to.equal(1);
    expect(hasHistory).to.equal(true);

    const winFlag = Number(lastOutcome);
    expect(winFlag === 0 || winFlag === 1).to.equal(true);

    const expectedBalanceAfter = Number(clearBalanceBefore) + 1000 * winFlag;
    expect(Number(clearBalanceAfter)).to.equal(expectedBalanceAfter);
  });
});
