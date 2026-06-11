// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title freefall v2 - session + score registry
contract FreefallGame {
    struct Entry {
        address player;
        uint96 score;
    }

    mapping(address => uint96) public bestScore;
    mapping(address => uint32) public gamesStarted;
    mapping(address => bool) public sessionOpen;
    Entry[10] public top10;
    uint256 public totalSessions;

    event GameStarted(address indexed player, uint256 timestamp);
    event ScoreAttested(address indexed player, uint96 score, bool newBest, uint256 timestamp);

    function startGame() external {
        sessionOpen[msg.sender] = true;
        gamesStarted[msg.sender]++;
        totalSessions++;
        emit GameStarted(msg.sender, block.timestamp);
    }

    function attestScore(uint96 score) external {
        require(sessionOpen[msg.sender], "no open session");
        require(score > 0, "zero score");
        sessionOpen[msg.sender] = false;

        bool newBest = score > bestScore[msg.sender];
        if (newBest) {
            bestScore[msg.sender] = score;
            _updateTop10(msg.sender, score);
        }
        emit ScoreAttested(msg.sender, score, newBest, block.timestamp);
    }

    function _updateTop10(address player, uint96 score) internal {
        uint256 slot = 10;
        uint256 lowest = 0;
        for (uint256 i = 0; i < 10; i++) {
            if (top10[i].player == player) { slot = i; break; }
            if (top10[i].score < top10[lowest].score) lowest = i;
        }
        if (slot == 10) {
            if (score <= top10[lowest].score) return;
            slot = lowest;
        }
        top10[slot] = Entry(player, score);
    }

    function getTop10() external view returns (Entry[10] memory) {
        return top10;
    }
}
