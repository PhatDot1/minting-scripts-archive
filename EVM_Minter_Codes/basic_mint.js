const axios = require('axios');
const fs = require('fs');
const path = require('path');
const hre = require("hardhat");
const FormData = require('form-data');

// Pinata API keys for authentication
const PINATA_API_KEY = '';
const PINATA_SECRET_API_KEY = '';

// upload image to Pinata
async function uploadToPinata(imageBuffer, filename) {
  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  const data = new FormData();
  data.append('file', imageBuffer, filename);

  const response = await axios.post(url, data, {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET_API_KEY,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  if (response.status === 200) {
    return `https://ipfs.io/ipfs/${response.data.IpfsHash}`;
  } else {
    throw new Error(`Failed to upload image to Pinata: ${response.statusText}`);
  }
}

// upload JSON metadata to Pinata
async function uploadJsonToPinata(jsonData, filename) {
  const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
  const response = await axios.post(url, {
    pinataContent: jsonData,
    pinataMetadata: { name: filename }
  }, {
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_SECRET_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 200) {
    return `https://ipfs.io/ipfs/${response.data.IpfsHash}`;
  } else {
    throw new Error(`Failed to upload JSON to Pinata: ${response.statusText}`);
  }
}

// main function to mint NFT
async function main() {
  const gifPath = path.join(__dirname, 'shiny.gif'); // path to GIF
  const gifBuffer = fs.readFileSync(gifPath);

  // upload GIF to Pinata
  const gifIpfsUrl = await uploadToPinata(gifBuffer, 'shiny.gif');
  console.log('GIF uploaded to Pinata:', gifIpfsUrl);

  // create JSON metadata with GIF's IPFS URL
  const metadata = {
    name: "Test NFT Token",
    description: "This is an NFT with a GIF",
    image: gifIpfsUrl,
    attributes: [
      { trait_type: "Background", value: "Blue" },
      { trait_type: "Rarity", value: "Common" }
    ]
  };

  // upload metadata to Pinata
  const metadataIpfsUrl = await uploadJsonToPinata(metadata, 'nft-metadata.json');
  console.log('Metadata uploaded to Pinata:', metadataIpfsUrl);

  // attach to deployed contract
  const contractAddress = '0x28F6D4Fe5648BbF2506E56a5b7f9D5522C3999f1'; // deployed contract address
  const ArbitrumNFTMinter = await hre.ethers.getContractFactory('ArbitrumNFTMinterX');
  const contract = await ArbitrumNFTMinter.attach(contractAddress);

  // mint NFT with metadata URL
  const quantity = 1;
  const tx = await contract.mint(quantity, metadataIpfsUrl, { value: hre.ethers.utils.parseEther('0.01') });
  const receipt = await tx.wait();

  const tokenId = receipt.events[0].args.tokenId.toString(); // minted token ID
  console.log('NFT minted successfully with metadata URL:', metadataIpfsUrl);

  // generate and log Arbiscan URL for minted NFT
  const nftUrl = `https://sepolia.arbiscan.io/nft/${contractAddress}/${tokenId}`;
  console.log(`View the minted NFT here: ${nftUrl}`);

  // fetch token URI from contract
  const tokenMetadataURI = await contract.tokenURI(tokenId);
  console.log(`Metadata URI for token ${tokenId}:`, tokenMetadataURI);

  // fetch and log metadata content
  const metadataResponse = await axios.get(tokenMetadataURI);
  console.log(`Metadata content for token ${tokenId}:`, metadataResponse.data);
}

// execute main function and handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });