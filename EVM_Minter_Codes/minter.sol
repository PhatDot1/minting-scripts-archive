// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract PPPolygonEncodeMinterADV is ERC721Enumerable, ERC2981, Ownable {
    using Strings for uint256;

    // variables for minting configuration
    uint256 public mintPrice = 0 ether;
    uint256 public maxSupply = 1000000;
    uint256 public nextTokenId = 0;
    mapping(uint256 => string) private _tokenURIs; // mapping for token-specific URIs

    mapping(address => bool) private minters; // track addresses authorized to mint

    // event for minting
    event Mint(address indexed minter, uint256 tokenId, string tokenURI);

    constructor() ERC721("EncodeCertificates", "ENCERT") Ownable(msg.sender) {
        _setDefaultRoyalty(0x1fF116257e646b6C0220a049e893e81DE87fc475, 500); // set 5% royalty
        // initialize authorized minters
        minters[0xa341b0F69359482862Ed4422c6057cd59560D9E4] = true;
        minters[0x1fF116257e646b6C0220a049e893e81DE87fc475] = true;
        minters[0x0696821637b294C0109a766fe5144D518B8619E2] = true;
    }

    // modifier to restrict minting to authorized addresses
    modifier onlyMinter() {
        require(minters[msg.sender], "Not authorized to mint");
        _;
    }

    // mint tokens with custom token URI or update existing NFT's with new URI
    function mint(uint256 quantity, string memory _tokenURI) public payable onlyMinter {
        require(quantity > 0, "Quantity cannot be zero");
        require(quantity <= 40, "Cannot mint more than 40 at a time");
        require(nextTokenId + quantity <= maxSupply, "Exceeds max supply");
        require(msg.value >= mintPrice * quantity, "Ether sent is not correct");

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId += 1;

            _safeMint(msg.sender, tokenId); // mint token
            _setTokenURI(tokenId, _tokenURI); // set token URI

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

    // withdraw contract balance to owner
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        payable(owner()).transfer(balance);
    }

    // add or remove minters (only callable by owner)
    function setMinter(address minter, bool allowed) public onlyOwner {
        minters[minter] = allowed;
    }

    // allow contract to accept ETH
    receive() external payable {}

    fallback() external payable {}

    // override supportsInterface to include ERC2981 royalties
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}