import {
  MinaNFT,
  MinaNFTNameService,
  MINANFT_NAME_SERVICE,
  accountBalanceMina,
  makeString,
  api,
} from "minanft";
import { PrivateKey, PublicKey, Poseidon, Signature } from "o1js";
import { PINATA_JWT, DEPLOYER, JWT } from "./env.json";

async function main() {
  MinaNFT.minaInit("berkeley");
  const deployer = PrivateKey.fromBase58(DEPLOYER);

  const ownerPrivateKey = PrivateKey.random();
  const ownerPublicKey = ownerPrivateKey.toPublicKey();
  console.log(`Deployer Public Key: ${deployer.toPublicKey().toBase58()}`);
  const nftPrivateKey = PrivateKey.random();
  const nftPublicKey = nftPrivateKey.toPublicKey();
  const owner = Poseidon.hash(ownerPublicKey.toFields());
  const pinataJWT = PINATA_JWT; // use "" to not pin on local network
  const name = "@EncodeNFT_" + makeString(10);
  const rawBalance = await accountBalanceMina(deployer.toPublicKey());
  console.log(`Deployer balance (raw): ${rawBalance}`);

  console.log(
    `Deployer balance: ${await accountBalanceMina(deployer.toPublicKey())}`
  );

  const nft = new MinaNFT({ name, owner, address: nftPublicKey });

  // Update description
  nft.updateText({
    key: `description`,
    text: "This NFT represents your participation and achievement in an Encode Club programme.",
  });
  nft.update({ key: `twitter`, value: `@test` });
  nft.update({ key: `secret`, value: `mysecretvalue`, isPrivate: true });

  // Use the provided IPFS link for image
  await nft.updateImage({
    filename: "https://gateway.pinata.cloud/ipfs/QmajnuqCupkURbsrWCKkSUPSQekGzXdqJQqxgca6y13MtK",
    pinataJWT,
    calculateRoot: false, // set to true to calculate root, but it takes a long time
  });

  // Use provided metadata link directly
  nft.update({ key: "metadata", value: "https://gateway.pinata.cloud/ipfs/QmdyP5Arb2ruoL15suVQYYTEWjEgX22mu8g9g8xQ5PLNjU" });

  console.log(`json:`, JSON.stringify(nft.toJSON(), null, 2));

  const nameService = new MinaNFTNameService({
    address: PublicKey.fromBase58(MINANFT_NAME_SERVICE),
  });

  // Register name
  const minanft = new api(JWT);
  const reserved = await minanft.reserveName({
    name,
    publicKey: nftPublicKey.toBase58(),
  });
  console.log("Reserved:", reserved);
  if (
    !reserved.success ||
    !reserved.isReserved ||
    reserved.signature === undefined
  ) {
    throw new Error("Name not reserved");
  }
  const signature: Signature = Signature.fromBase58(reserved.signature);

  console.log("Compiling...");
  await MinaNFT.compile();
  console.log("Deploying...");
  const tx = await nft.mint({
    deployer,
    owner,
    pinataJWT,
    nameService,
    signature,
    privateKey: nftPrivateKey,
  });
  if (tx === undefined) {
    throw new Error("Mint failed");
  } else console.log("Minted, transaction hash:", tx);

  console.log("Waiting for transaction to be included in a block...");
  console.time("Transaction included in a block");
  await MinaNFT.wait(tx);
  console.timeEnd("Transaction included in a block");

  const indexed = await minanft.indexName({ name });
  console.log("Indexed:", indexed);
}

main().catch((error) => {
  console.error(error);
});
