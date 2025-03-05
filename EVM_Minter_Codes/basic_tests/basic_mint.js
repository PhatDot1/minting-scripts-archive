const axios = require('axios');
const fs = require('fs');
const path = require('path');
const hre = require("hardhat");
const FormData = require('form-data');

// Pinata API keys
const PINATA_API_KEY = process.env['PINATA_API_KEY'];
const PINATA_SECRET_API_KEY = process.env['PINATA_SECRET_API_KEY'];

// Function to upload image to Pinata
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
    return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
  } else {
    throw new Error(`Failed to upload image to Pinata: ${response.statusText}`);
  }
}

// Function to upload JSON metadata to Pinata
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
    return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
  } else {
    throw new Error(`Failed to upload JSON to Pinata: ${response.statusText}`);
  }
}

// Main function to mint NFT
async function main() {
  // Path to your GIF
  const gifPath = path.join(__dirname, 'shiny.gif'); // Update with your GIF path
  const gifBuffer = fs.readFileSync(gifPath);

  // Step 1: Upload GIF to Pinata
  const gifIpfsUrl = await uploadToPinata(gifBuffer, 'shiny.gif');
  console.log('GIF uploaded to Pinata:', gifIpfsUrl);

  // Step 2: Create JSON metadata pointing to the GIF's IPFS URL
  const metadata = {
    name: "Test NFT Token",
    description: "This is an NFT with a GIF",
    image: gifIpfsUrl, // IPFS URL for the GIF
    attributes: [
      {
        trait_type: "Background",
        value: "Blue"
      },
      {
        trait_type: "Rarity",
        value: "Common"
      }
    ]
  };

  // Step 3: Upload JSON metadata to Pinata
  const metadataIpfsUrl = await uploadJsonToPinata(metadata, 'nft-metadata.json');
  console.log('Metadata uploaded to Pinata:', metadataIpfsUrl);

  // Step 4: Get the deployed contract to interact with
  const contractAddress = '0x236B54bd3A9D8ad8aEa3C05b56e9d1265dA3cD5F'; // Your deployed contract address
  const ArbitrumNFTMinter = await hre.ethers.getContractFactory('PPPolygonEncodeMinterADV');
  const contract = await ArbitrumNFTMinter.attach(contractAddress);

  // Step 5: Mint the NFT with the full metadata URI
  const quantity = 1; // Adjust if you want to mint multiple tokens at once
  const tx = await contract.mint(quantity, metadataIpfsUrl);
  const receipt = await tx.wait();

  const tokenId = receipt.events[0].args.tokenId.toString(); // Get the minted token ID

  console.log('NFT minted successfully with metadata URL:', metadataIpfsUrl);
  
  // Generate the Arbiscan URL for the minted NFT
  const nftUrl = `https://amoy.polygonscan.com/nft/${contractAddress}/${tokenId}`;
  console.log(`View the minted NFT here: ${nftUrl}`);

  // Step 6: Fetch the token URI from the contract
  const tokenMetadataURI = await contract.tokenURI(tokenId);
  console.log(`Metadata URI for token ${tokenId}:`, tokenMetadataURI);

  // Step 7: Fetch and log the metadata content
  const metadataResponse = await axios.get(tokenMetadataURI);
  console.log(`Metadata content for token ${tokenId}:`, metadataResponse.data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
