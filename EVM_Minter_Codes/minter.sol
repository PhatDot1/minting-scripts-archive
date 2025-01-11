// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract PPPolygonEncodeMinter is ERC721Enumerable, Ownable {
    using Strings for uint256;

    // variables
    uint256 public mintPrice = 0 ether;
    uint256 public maxSupply = 1000000;
    uint256 public nextTokenId = 0;
    mapping(uint256 => string) private _tokenURIs; // token-specific URIs

    // events
    event Mint(address indexed minter, uint256 tokenId, string tokenURI);

    constructor() ERC721("EncodeCertificates", "ENCERT") Ownable(msg.sender) {} // pass msg.sender to Ownable constructor

    // minting func
    function mint(uint256 quantity, string memory _tokenURI) public payable {
        require(quantity > 0, "Quantity cannot be zero");
        require(quantity <= 40, "Cannot mint more than 40 at a time");
        require(nextTokenId + quantity <= maxSupply, "Exceeds max supply");
        require(msg.value >= mintPrice * quantity, "Ether sent is not correct");

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId += 1;

            _safeMint(msg.sender, tokenId);
            _setTokenURI(tokenId, _tokenURI); // set token-specific URI

            emit Mint(msg.sender, tokenId, _tokenURI);
        }
    }

    // internal func to set token-specific URIs
    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal {
        _tokenURIs[tokenId] = _tokenURI;
    }

    // override tokenURI to return correct URI for each token
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        return _tokenURIs[tokenId];
    }

    // func to withdraw funds (only for owners)
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        payable(owner()).transfer(balance);
    }

    // fallback and receive functions to accept ETH
    receive() external payable {}

    fallback() external payable {}
}