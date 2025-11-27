import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/GhostOdds.css';

type DecryptedSnapshot = {
  balance: number | null;
  dice: number | null;
  guess: number | null;
  outcome: number | null;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function GhostOddsApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [statusMessage, setStatusMessage] = useState('');
  const [actions, setActions] = useState({
    deposit: false,
    round: false,
    guess: false,
    decrypt: false,
  });
  const [decryptedData, setDecryptedData] = useState<DecryptedSnapshot>({
    balance: null,
    dice: null,
    guess: null,
    outcome: null,
  });

  const {
    data: hasJoinedData,
    refetch: refetchJoined,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasJoined',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: boolean | undefined; refetch: () => Promise<unknown> };

  const {
    data: balanceData,
    refetch: refetchBalance,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerBalance',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: string | undefined; refetch: () => Promise<unknown> };

  const {
    data: metadata,
    refetch: refetchMetadata,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getRoundMetadata',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: readonly [boolean, boolean] | undefined; refetch: () => Promise<unknown> };

  const {
    data: diceData,
    refetch: refetchDice,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getDiceResult',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: string | undefined; refetch: () => Promise<unknown> };

  const {
    data: guessData,
    refetch: refetchGuess,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLastGuess',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: string | undefined; refetch: () => Promise<unknown> };

  const {
    data: outcomeData,
    refetch: refetchOutcome,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLastOutcome',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  }) as { data: string | undefined; refetch: () => Promise<unknown> };

  const joined = hasJoinedData ?? false;
  const roundIsActive = metadata?.[0] ?? false;
  const hasHistory = metadata?.[1] ?? false;

  const updateAction = (name: keyof typeof actions, value: boolean) =>
    setActions(prev => ({ ...prev, [name]: value }));

  const refreshAllReads = async () => {
    await Promise.all([
      refetchBalance(),
      refetchMetadata(),
      refetchDice(),
      refetchGuess(),
      refetchOutcome(),
      refetchJoined(),
    ]);
  };

  const requireContractReady = () => {
    if (CONTRACT_ADDRESS === ZERO_ADDRESS) {
      throw new Error('Please configure the deployed contract address first.');
    }
  };

  const getContract = async () => {
    requireContractReady();
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect your wallet to continue.');
    }
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  const handleDeposit = async () => {
    if (!depositAmount) {
      setStatusMessage('Enter an ETH amount to convert.');
      return;
    }

    try {
      updateAction('deposit', true);
      setStatusMessage('Submitting deposit...');
      const contract = await getContract();
      const tx = await contract.joinGame({ value: ethers.parseEther(depositAmount) });
      await tx.wait();
      setStatusMessage('Points minted successfully.');
      await refreshAllReads();
    } catch (error) {
      setStatusMessage(
        `Deposit failed: ${error instanceof Error ? error.message : 'Unknown error occurred.'}`,
      );
    } finally {
      updateAction('deposit', false);
    }
  };

  const handleStartRound = async () => {
    try {
      updateAction('round', true);
      setStatusMessage('Locking dice for this round...');
      const contract = await getContract();
      const tx = await contract.startRound();
      await tx.wait();
      setStatusMessage('Dice locked in! Submit your encrypted guess.');
      await refreshAllReads();
    } catch (error) {
      setStatusMessage(
        `Could not start a round: ${error instanceof Error ? error.message : 'Unknown error.'}`,
      );
    } finally {
      updateAction('round', false);
    }
  };

  const handleGuess = async (guessValue: 1 | 2) => {
    if (!instance) {
      setStatusMessage('Encryption service unavailable. Please wait a moment and try again.');
      return;
    }
    if (!address) {
      setStatusMessage('Connect your wallet to submit a guess.');
      return;
    }

    try {
      updateAction('guess', true);
      setStatusMessage('Encrypting guess...');
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .add32(guessValue)
        .encrypt();

      const contract = await getContract();
      const tx = await contract.submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
      setStatusMessage('Guess submitted. Waiting for confirmation...');
      await tx.wait();
      setStatusMessage('Round settled! Decrypt to see your result.');
      await refreshAllReads();
    } catch (error) {
      setStatusMessage(
        `Guess failed: ${error instanceof Error ? error.message : 'Unknown error occurred.'}`,
      );
    } finally {
      updateAction('guess', false);
    }
  };

  const handleDecrypt = async () => {
    if (!instance) {
      setStatusMessage('Encryption service is not ready yet.');
      return;
    }
    if (!address) {
      setStatusMessage('Connect your wallet first.');
      return;
    }

    const handles = [balanceData, diceData, guessData, outcomeData].filter(
      handle => handle && handle !== ethers.ZeroHash,
    ) as string[];

    if (handles.length === 0) {
      setStatusMessage('No encrypted data is available yet.');
      return;
    }

    try {
      updateAction('decrypt', true);
      setStatusMessage('Requesting secure decryption...');

      const keypair = instance.generateKeypair();
      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTime,
        durationDays,
      );
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable.');
      }
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handles.map(handle => ({ handle, contractAddress: CONTRACT_ADDRESS })),
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTime,
        durationDays,
      );

      setDecryptedData({
        balance: balanceData && result[balanceData] ? Number(result[balanceData]) : null,
        dice: diceData && result[diceData] ? Number(result[diceData]) : null,
        guess: guessData && result[guessData] ? Number(result[guessData]) : null,
        outcome: outcomeData && result[outcomeData] ? Number(result[outcomeData]) : null,
      });

      setStatusMessage('Decrypted! Review your private stats below.');
    } catch (error) {
      setStatusMessage(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error occurred.'}`,
      );
    } finally {
      updateAction('decrypt', false);
    }
  };

  const previewPoints = (() => {
    const parsed = Number(depositAmount);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed * 10000;
  })();

  return (
    <div className="ghost-wrapper">
      <div className="ghost-hero">
        <div>
          <p className="hero-badge">Ghost Odds • Zama FHE Dice</p>
          <h1>Encrypted dice, provable payouts</h1>
          <p className="hero-copy">
            Swap ETH for privacy-preserving points, roll the on-chain dice, and submit a Big (1) or
            Small (2) guess fully encrypted. Wins add 1000 points without ever revealing your play.
          </p>
        </div>
        <div className="hero-connect">
          <ConnectButton label="Connect Wallet" />
          <div className="hero-status">
            {zamaLoading && <span>Initializing encryption relayer...</span>}
            {zamaError && <span className="error-text">{zamaError}</span>}
            {!zamaLoading && !zamaError && <span>Relayer ready</span>}
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <section className="panel-card">
          <header>
            <h3>1. Join the table</h3>
            <p>1 ETH = 10,000 encrypted points.</p>
          </header>
          <div className="form-row">
            <label htmlFor="deposit-amount">ETH amount</label>
            <input
              id="deposit-amount"
              type="number"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={event => setDepositAmount(event.target.value)}
              placeholder="0.10"
            />
          </div>
          <p className="helper-text">
            You&apos;ll receive approximately <strong>{previewPoints.toFixed(0)} points</strong>.
          </p>
          <button
            onClick={handleDeposit}
            disabled={!isConnected || actions.deposit}
            className="primary-btn"
          >
            {actions.deposit ? 'Processing...' : 'Convert ETH to Points'}
          </button>
          <div className="info-line">
            {joined ? 'Wallet is registered for Ghost Odds.' : 'Deposit once to join the game.'}
          </div>
        </section>

        <section className="panel-card">
          <header>
            <h3>2. Roll &amp; guess</h3>
            <p>Start a round, then pick Big (4-6) or Small (1-3).</p>
          </header>
          <div className="status-banner">
            <div>
              <span className="label">Round status</span>
              <strong>{roundIsActive ? 'Active' : 'Standby'}</strong>
            </div>
            <div>
              <span className="label">History</span>
              <strong>{hasHistory ? 'Complete' : 'Pending'}</strong>
            </div>
          </div>
          <button
            onClick={handleStartRound}
            disabled={!joined || actions.round || CONTRACT_ADDRESS === ZERO_ADDRESS}
            className="secondary-btn"
          >
            {actions.round ? 'Locking dice...' : 'Start encrypted round'}
          </button>
          <div className="guess-buttons">
            <button
              onClick={() => handleGuess(1)}
              disabled={!roundIsActive || actions.guess}
              className="guess-btn"
            >
              {actions.guess ? 'Sending...' : 'Guess Big (1)'}
            </button>
            <button
              onClick={() => handleGuess(2)}
              disabled={!roundIsActive || actions.guess}
              className="guess-btn"
            >
              {actions.guess ? 'Sending...' : 'Guess Small (2)'}
            </button>
          </div>
          <p className="helper-text">
            Correct guesses add 1,000 points. Wrong guesses add zero, and the dice stay private until
            the round ends.
          </p>
        </section>

        <section className="panel-card">
          <header>
            <h3>3. Decrypt your stats</h3>
            <p>Only your wallet can decrypt balances and dice results.</p>
          </header>
          <button
            onClick={handleDecrypt}
            disabled={!isConnected || actions.decrypt}
            className="primary-btn"
          >
            {actions.decrypt ? 'Decrypting...' : 'Decrypt latest data'}
          </button>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="label">Points</p>
              <strong>{decryptedData.balance ?? '---'}</strong>
            </div>
            <div className="stat-card">
              <p className="label">Last dice</p>
              <strong>{decryptedData.dice ?? '---'}</strong>
            </div>
            <div className="stat-card">
              <p className="label">Your guess</p>
              <strong>
                {decryptedData.guess === null
                  ? '---'
                  : decryptedData.guess === 1
                    ? 'Big'
                    : decryptedData.guess === 2
                      ? 'Small'
                      : decryptedData.guess}
              </strong>
            </div>
            <div className="stat-card">
              <p className="label">Outcome</p>
              <strong>
                {decryptedData.outcome === null
                  ? '---'
                  : decryptedData.outcome === 1
                    ? 'WIN'
                    : 'LOSS'}
              </strong>
            </div>
          </div>
        </section>
      </div>

      {statusMessage && <div className="status-toast">{statusMessage}</div>}
    </div>
  );
}
