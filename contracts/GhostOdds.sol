// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title GhostOdds
 * @notice Dice guessing game that keeps player balances and round data encrypted with Zama FHE.
 *         Players join by swapping ETH for encrypted points, start a round to roll the dice,
 *         and submit an encrypted guess (1 for Big, 2 for Small). Correct guesses earn 1000 points.
 */
contract GhostOdds is ZamaEthereumConfig {
    uint64 private constant POINTS_PER_ETH = 10_000;
    uint64 private constant ROUND_REWARD = 1_000;

    struct RoundData {
        euint32 diceResult;
        euint32 lastGuess;
        euint32 winFlag;
        bool isActive;
        bool hasHistory;
    }

    mapping(address => euint64) private encryptedBalances;
    mapping(address => bool) private joinedPlayers;
    mapping(address => RoundData) private rounds;

    event PointsPurchased(address indexed player, uint256 ethAmount, uint64 pointsMinted);
    event RoundStarted(address indexed player);
    event GuessResolved(address indexed player);

    error InvalidDeposit();
    error PlayerNotJoined();
    error RoundAlreadyActive();
    error RoundNotActive();

    /**
     * @notice Swap ETH for encrypted points at a fixed rate (1 ETH = 10,000 points).
     * @dev Minted points are encrypted and access is granted both to the contract and the sender.
     */
    function joinGame() external payable returns (uint64 mintedPoints) {
        if (msg.value == 0) {
            revert InvalidDeposit();
        }

        mintedPoints = uint64((msg.value * POINTS_PER_ETH) / 1 ether);
        if (mintedPoints == 0) {
            revert InvalidDeposit();
        }

        euint64 encryptedMint = FHE.asEuint64(mintedPoints);
        encryptedBalances[msg.sender] = FHE.add(encryptedBalances[msg.sender], encryptedMint);
        FHE.allowThis(encryptedBalances[msg.sender]);
        FHE.allow(encryptedBalances[msg.sender], msg.sender);

        joinedPlayers[msg.sender] = true;

        emit PointsPurchased(msg.sender, msg.value, mintedPoints);
    }

    /**
     * @notice Begin a new dice round. The dice result stays encrypted until the guess is submitted.
     */
    function startRound() external {
        if (!joinedPlayers[msg.sender]) {
            revert PlayerNotJoined();
        }

        RoundData storage round = rounds[msg.sender];
        if (round.isActive) {
            revert RoundAlreadyActive();
        }

        euint32 diceZeroToFive = FHE.rem(FHE.randEuint32(), 6);
        euint32 diceValue = FHE.add(diceZeroToFive, FHE.asEuint32(1));

        round.diceResult = diceValue;
        round.lastGuess = FHE.asEuint32(0);
        round.winFlag = FHE.asEuint32(0);
        round.isActive = true;

        FHE.allowThis(round.diceResult);
        FHE.allowThis(round.lastGuess);
        FHE.allowThis(round.winFlag);

        emit RoundStarted(msg.sender);
    }

    /**
     * @notice Submit an encrypted guess: 1 represents Big (4-6), 2 represents Small (1-3).
     *         Correct guesses award 1000 encrypted points.
     */
    function submitGuess(externalEuint32 encryptedGuess, bytes calldata inputProof) external {
        if (!joinedPlayers[msg.sender]) {
            revert PlayerNotJoined();
        }

        RoundData storage round = rounds[msg.sender];
        if (!round.isActive) {
            revert RoundNotActive();
        }

        euint32 playerGuess = FHE.fromExternal(encryptedGuess, inputProof);
        euint32 diceValue = round.diceResult;

        ebool diceIsBig = FHE.gt(diceValue, FHE.asEuint32(3));
        euint32 diceCategory = FHE.select(diceIsBig, FHE.asEuint32(1), FHE.asEuint32(2));
        ebool guessMatches = FHE.eq(playerGuess, diceCategory);
        euint32 winFlag = FHE.select(guessMatches, FHE.asEuint32(1), FHE.asEuint32(0));

        euint64 reward = FHE.mul(FHE.asEuint64(winFlag), FHE.asEuint64(ROUND_REWARD));
        encryptedBalances[msg.sender] = FHE.add(encryptedBalances[msg.sender], reward);

        round.lastGuess = playerGuess;
        round.winFlag = winFlag;
        round.isActive = false;
        round.hasHistory = true;

        FHE.allowThis(encryptedBalances[msg.sender]);
        FHE.allow(encryptedBalances[msg.sender], msg.sender);
        FHE.allowThis(round.lastGuess);
        FHE.allowThis(round.winFlag);
        FHE.allow(round.diceResult, msg.sender);
        FHE.allow(round.lastGuess, msg.sender);
        FHE.allow(round.winFlag, msg.sender);

        emit GuessResolved(msg.sender);
    }

    /**
     * @notice Return the encrypted point balance for any player.
     */
    function getPlayerBalance(address player) external view returns (euint64) {
        return encryptedBalances[player];
    }

    /**
     * @notice Returns public metadata for a player's current or last round.
     */
    function getRoundMetadata(address player) external view returns (bool isActive, bool hasHistory) {
        RoundData storage round = rounds[player];
        return (round.isActive, round.hasHistory);
    }

    /**
     * @notice Returns the encrypted dice result for a given player.
     */
    function getDiceResult(address player) external view returns (euint32) {
        return rounds[player].diceResult;
    }

    /**
     * @notice Returns the encrypted guess from the player's latest round.
     */
    function getLastGuess(address player) external view returns (euint32) {
        return rounds[player].lastGuess;
    }

    /**
     * @notice Returns the encrypted win flag (1 = win, 0 = loss) from the player's latest round.
     */
    function getLastOutcome(address player) external view returns (euint32) {
        return rounds[player].winFlag;
    }

    /**
     * @notice Checks whether a player has joined using ETH.
     */
    function hasJoined(address player) external view returns (bool) {
        return joinedPlayers[player];
    }
}
