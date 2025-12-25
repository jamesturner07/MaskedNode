import { useMemo, useState } from 'react';
import { Contract, ZeroAddress, isAddress } from 'ethers';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { formatDate, generateMaskAddress, maskMessage, shorten, unmaskMessage } from '../utils/masking';
import '../styles/MaskedNode.css';

type NodeView = {
  id: bigint;
  owner: string;
  encryptedMask: string;
  maskedMessage: string;
  createdAt: bigint;
  authorized: readonly string[];
};

export function MaskedNodeApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [decryptingNode, setDecryptingNode] = useState<bigint | null>(null);
  const [sharingNode, setSharingNode] = useState<bigint | null>(null);
  const [shareTargets, setShareTargets] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, { mask: string; message: string }>>({});

  const contractReady = CONTRACT_ADDRESS !== ZeroAddress;

  const { data: nodeIdsData, refetch: refetchNodeIds, isFetching: idsLoading } = useReadContract({
    address: contractReady ? CONTRACT_ADDRESS : undefined,
    abi: CONTRACT_ABI,
    functionName: 'getNodeIds',
    args: address ? [address] : undefined,
    query: { enabled: !!address && contractReady },
  });

  const nodeIds = useMemo(() => (nodeIdsData as bigint[] | undefined) ?? [], [nodeIdsData]);

  const nodesQuery = useReadContracts({
    contracts: contractReady
      ? nodeIds.map((id) => ({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getNode',
          args: [id],
        }))
      : [],
    query: { enabled: contractReady && nodeIds.length > 0 },
  });

  const authQuery = useReadContracts({
    contracts: contractReady
      ? nodeIds.map((id) => ({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getAuthorizedAddresses',
          args: [id],
        }))
      : [],
    query: { enabled: contractReady && nodeIds.length > 0 },
  });

  const nodes: NodeView[] = useMemo(() => {
    if (!nodesQuery.data) return [];
    return nodesQuery.data
      .map((entry, idx) => {
        if (!entry?.result) return null;
        const [owner, encryptedMask, maskedMessage, createdAt] = entry.result as unknown as [
          string,
          string,
          string,
          bigint
        ];
        const authorized = (authQuery.data?.[idx]?.result as readonly string[] | undefined) ?? [];
        return {
          id: nodeIds[idx],
          owner,
          encryptedMask,
          maskedMessage,
          createdAt,
          authorized,
        };
      })
      .filter(Boolean) as NodeView[];
  }, [nodesQuery.data, authQuery.data, nodeIds]);

  const handleCreate = async () => {
    if (!message.trim()) {
      setError('Please enter a message to mask.');
      return;
    }
    if (!contractReady) {
      setError('Contract address is not set. Deploy on Sepolia and update the config.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setError('Connect your wallet and wait for encryption to finish loading.');
      return;
    }
    setError(null);
    setStatus('Encrypting mask and preparing transaction...');
    setSubmitting(true);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('No signer available');
      }
      const maskAddress = generateMaskAddress();
      const maskedMessage = maskMessage(message.trim(), maskAddress);

      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .addAddress(maskAddress)
        .encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createNode(encryptedInput.handles[0], maskedMessage, encryptedInput.inputProof);
      setConfirming(true);
      await tx.wait();

      setMessage('');
      setStatus('Stored securely on-chain.');
      await refetchNodeIds();
      await nodesQuery.refetch();
      await authQuery.refetch();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to create node');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const handleDecrypt = async (node: NodeView) => {
    if (!contractReady) {
      setError('Contract address is not set. Deploy on Sepolia and update the config.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setError('Connect your wallet before decrypting.');
      return;
    }
    setError(null);
    setDecryptingNode(node.id);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('No signer available');
      }
      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle: node.encryptedMask, contractAddress: CONTRACT_ADDRESS }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const mask = result[node.encryptedMask] as string;
      const clearMessage = unmaskMessage(node.maskedMessage, mask);
      setRevealed((prev) => ({ ...prev, [node.id.toString()]: { mask, message: clearMessage } }));
      setStatus('Mask decrypted.');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Decryption failed');
    } finally {
      setDecryptingNode(null);
    }
  };

  const handleGrantAccess = async (nodeId: bigint) => {
    const target = shareTargets[nodeId.toString()]?.trim();
    if (!target) {
      setError('Enter an address to share with.');
      return;
    }
    if (!isAddress(target)) {
      setError('Address is not valid.');
      return;
    }
    if (!contractReady) {
      setError('Contract address is not set. Deploy on Sepolia and update the config.');
      return;
    }
    if (!signerPromise) {
      setError('Connect your wallet first.');
      return;
    }
    setError(null);
    setSharingNode(nodeId);

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('No signer available');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.grantAccess(nodeId, target);
      await tx.wait();
      await authQuery.refetch();
      setShareTargets((prev) => ({ ...prev, [nodeId.toString()]: '' }));
      setStatus('Access granted.');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to grant access');
    } finally {
      setSharingNode(null);
    }
  };

  const renderNodeCard = (node: NodeView) => {
    const reveal = revealed[node.id.toString()];
    return (
      <div key={node.id.toString()} className="node-card">
        <div className="node-card__header">
          <div>
            <p className="node-label">Node #{node.id.toString()}</p>
            <p className="node-time">{formatDate(node.createdAt)}</p>
          </div>
          <span className="badge">encrypted</span>
        </div>

        <div className="node-body">
          <div className="node-row">
            <p className="node-row__label">Owner</p>
            <p className="node-row__value">{shorten(node.owner)}</p>
          </div>

          <div className="node-row">
            <p className="node-row__label">Masked message</p>
            <p className="node-row__value monospace">
              {shorten(node.maskedMessage, 10, 6)}
            </p>
          </div>

          <div className="node-row">
            <p className="node-row__label">Authorized</p>
            <div className="chips">
              {node.authorized.map((addr) => (
                <span key={addr} className="chip">
                  {shorten(addr)}
                </span>
              ))}
              {!node.authorized.length && <span className="chip muted">owner only</span>}
            </div>
          </div>

          {reveal ? (
            <div className="reveal-box">
              <div className="node-row">
                <p className="node-row__label">Mask address</p>
                <p className="node-row__value monospace">{reveal.mask}</p>
              </div>
              <div className="node-row">
                <p className="node-row__label">Message</p>
                <p className="node-row__value">{reveal.message}</p>
              </div>
            </div>
          ) : (
            <button
              className="primary-button"
              onClick={() => handleDecrypt(node)}
              disabled={decryptingNode === node.id || zamaLoading}
            >
              {decryptingNode === node.id ? 'Decrypting...' : 'Decrypt node'}
            </button>
          )}
        </div>

        <div className="share-box">
          <p className="node-row__label">Share decryption</p>
          <div className="share-row">
            <input
              type="text"
              placeholder="0x… recipient"
              value={shareTargets[node.id.toString()] ?? ''}
              onChange={(e) =>
                setShareTargets((prev) => ({ ...prev, [node.id.toString()]: e.target.value }))
              }
            />
            <button
              className="ghost-button"
              onClick={() => handleGrantAccess(node.id)}
              disabled={sharingNode === node.id}
            >
              {sharingNode === node.id ? 'Granting...' : 'Grant access'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="hero">
        <div>
          <p className="eyebrow">Fully homomorphic messaging</p>
          <h1>Mask a message with a secret address.</h1>
          <p className="subtitle">
            We encrypt the mask with Zama&apos;s FHE so only you (or someone you authorize) can unwrap the
            stored note and reveal the original text.
          </p>
          <div className="hero-actions">
            <ConnectButton />
            <span className="helper">{zamaLoading ? 'Loading relayer...' : 'Ready to encrypt'}</span>
          </div>
        </div>
        <div className="hero-card">
          <p className="hero-card__title">Create a masked node</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type the secret you want to protect"
            rows={4}
          />
          <button
            className="primary-button"
            onClick={handleCreate}
            disabled={!isConnected || submitting || confirming || zamaLoading}
          >
            {confirming ? 'Confirming...' : submitting ? 'Encrypting...' : 'Save encrypted node'}
          </button>
          <p className="hint">
            A random EVM address is generated as the mask. It encrypts your message locally, while the mask
            itself is stored on-chain as FHE data.
          </p>
        </div>
      </div>

      <div className="content">
        <div className="section-header">
          <div>
            <p className="eyebrow">My nodes</p>
            <h2>Decrypt or share access</h2>
          </div>
          <div className="status-pill">
            {idsLoading || nodesQuery.isFetching || authQuery.isFetching ? 'Refreshing...' : status || 'Up to date'}
          </div>
        </div>

        {!contractReady && (
          <div className="error-banner">
            Add the Sepolia deployment address from <code>deployments/sepolia/MaskedNode.json</code> to
            <code>home/src/config/contracts.ts</code> to enable on-chain reads.
          </div>
        )}

        {!isConnected ? (
          <div className="empty-state">
            <p>Connect your wallet to view encrypted nodes.</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="empty-state">
            <p>No nodes yet. Create one above to see it appear here.</p>
          </div>
        ) : (
          <div className="grid">{nodes.map(renderNodeCard)}</div>
        )}

        {(error || zamaError) && <div className="error-banner">{error || zamaError}</div>}
      </div>
    </div>
  );
}
