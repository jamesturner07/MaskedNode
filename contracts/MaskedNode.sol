// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title MaskedNode - store encrypted addresses and masked messages
/// @notice Each node keeps an encrypted mask address and an XOR-masked message.
/// @dev Messages are masked off-chain with a random EVM address. The encrypted
/// mask is stored as an `eaddress` and ACL permissions are handled via FHE.
contract MaskedNode is ZamaEthereumConfig {
    struct NodeData {
        address owner;
        eaddress encryptedMask;
        bytes maskedMessage;
        uint256 createdAt;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => NodeData) private _nodes;
    mapping(address => uint256[]) private _userNodeIds;
    mapping(uint256 => mapping(address => bool)) private _authorizations;
    mapping(uint256 => address[]) private _authorizationList;

    error NodeNotFound();
    error EmptyMessage();
    error InvalidDelegate();
    error DelegateAlreadyAuthorized();
    error NotNodeOwner();

    event NodeCreated(uint256 indexed nodeId, address indexed owner, uint256 messageLength);
    event AccessGranted(uint256 indexed nodeId, address indexed owner, address indexed delegate);

    /// @notice Create a new node with an encrypted mask address and masked message.
    /// @param encryptedMask The encrypted mask address handle produced off-chain.
    /// @param maskedMessage The message masked with the clear mask address bytes.
    /// @param inputProof The proof generated alongside the encrypted mask input.
    /// @return nodeId The identifier of the created node.
    function createNode(
        externalEaddress encryptedMask,
        bytes calldata maskedMessage,
        bytes calldata inputProof
    ) external returns (uint256 nodeId) {
        if (maskedMessage.length == 0) {
            revert EmptyMessage();
        }

        eaddress storedMask = FHE.fromExternal(encryptedMask, inputProof);

        nodeId = _nextId++;
        _nodes[nodeId] = NodeData({
            owner: msg.sender,
            encryptedMask: storedMask,
            maskedMessage: maskedMessage,
            createdAt: block.timestamp
        });

        _userNodeIds[msg.sender].push(nodeId);
        _authorizations[nodeId][msg.sender] = true;
        _authorizationList[nodeId].push(msg.sender);

        FHE.allow(storedMask, msg.sender);
        FHE.allowThis(storedMask);

        emit NodeCreated(nodeId, msg.sender, maskedMessage.length);
    }

    /// @notice Grant another address permission to decrypt the mask of a node.
    /// @param nodeId The node to authorize access for.
    /// @param delegate The address allowed to decrypt the mask.
    function grantAccess(uint256 nodeId, address delegate) external {
        NodeData storage data = _nodes[nodeId];
        if (data.owner == address(0)) {
            revert NodeNotFound();
        }
        if (data.owner != msg.sender) {
            revert NotNodeOwner();
        }
        if (delegate == address(0)) {
            revert InvalidDelegate();
        }
        if (_authorizations[nodeId][delegate]) {
            revert DelegateAlreadyAuthorized();
        }

        _authorizations[nodeId][delegate] = true;
        _authorizationList[nodeId].push(delegate);

        FHE.allow(data.encryptedMask, delegate);

        emit AccessGranted(nodeId, msg.sender, delegate);
    }

    /// @notice Get the data of a node by id.
    /// @param nodeId The node identifier.
    /// @return owner The owner of the node.
    /// @return encryptedMask The encrypted mask address handle.
    /// @return maskedMessage The masked message bytes.
    /// @return createdAt The timestamp when the node was created.
    function getNode(
        uint256 nodeId
    ) external view returns (address owner, eaddress encryptedMask, bytes memory maskedMessage, uint256 createdAt) {
        NodeData storage data = _nodes[nodeId];
        if (data.owner == address(0)) {
            revert NodeNotFound();
        }

        return (data.owner, data.encryptedMask, data.maskedMessage, data.createdAt);
    }

    /// @notice Get all node ids created by a user.
    /// @param user The address to query nodes for.
    /// @return An array of node ids.
    function getNodeIds(address user) external view returns (uint256[] memory) {
        return _userNodeIds[user];
    }

    /// @notice List addresses authorized to decrypt a node's mask.
    /// @param nodeId The node identifier.
    /// @return An array of authorized addresses.
    function getAuthorizedAddresses(uint256 nodeId) external view returns (address[] memory) {
        if (_nodes[nodeId].owner == address(0)) {
            revert NodeNotFound();
        }
        return _authorizationList[nodeId];
    }
}
