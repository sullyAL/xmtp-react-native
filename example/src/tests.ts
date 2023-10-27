import ReactNativeBlobUtil from "react-native-blob-util";
import * as XMTP from "../../src/index";

const { fs } = ReactNativeBlobUtil;

export type Test = {
  name: string;
  run: () => Promise<boolean>;
};

export const tests: Test[] = [];

function delayToPropogate(): Promise<void> {
  // delay 1s to avoid clobbering
  return new Promise((r) => setTimeout(r, 100));
}

function test(name: string, perform: () => Promise<boolean>) {
  tests.push({ name, run: perform });
}

test("can make a client", async () => {
  const client = await XMTP.Client.createRandom({
    env: "local",
    appVersion: "Testing/0.0.0",
  });
  return client.address.length > 0;
});

test("can pass a custom filter date and receive message objects with expected dates", async () => {
  try {
    const bob = await XMTP.Client.createRandom({ env: "local" });
    const alice = await XMTP.Client.createRandom({ env: "local" });

    if (bob.address === alice.address) {
      throw new Error("bob and alice should be different");
    }

    const bobConversation = await bob.conversations.newConversation(
      alice.address
    );

    const aliceConversation = (await alice.conversations.list())[0];
    if (!aliceConversation) {
      throw new Error("aliceConversation should exist");
    }

    let sentAt = Date.now();
    await bobConversation.send({ text: "hello" });

    // Show all messages before date in the past
    const messages1: DecodedMessage[] = await aliceConversation.messages(
      undefined,
      new Date("2023-01-01")
    );

    // Show all messages before date in the future
    const messages2: DecodedMessage[] = await aliceConversation.messages(
      undefined,
      new Date("2025-01-01")
    );

    const isAboutRightSendTime = Math.abs(messages2[0].sent - sentAt) < 1000;

    return !messages1.length && messages2.length === 1 && isAboutRightSendTime;
  } catch (e) {
    return false;
  }
});

test("canMessage", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  const alice = await XMTP.Client.createRandom({ env: "local" });

  const canMessage = await bob.canMessage(alice.address);
  return canMessage;
});

test("createFromKeyBundle throws error for non string value", async () => {
  try {
    const bytes = randomBytes(32);
    await XMTP.Client.createFromKeyBundle(JSON.stringify(bytes), {
      env: "local",
    });
  } catch (e) {
    return true;
  }
  return false;
});

test("canPrepareMessage", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  const alice = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();

  const bobConversation = await bob.conversations.newConversation(
      alice.address,
  );
  await delayToPropogate();

  const prepared = await bobConversation.prepareMessage("hi");
  if (!prepared.preparedAt) {
    throw new Error("missing `preparedAt` on prepared message");
  }

  // Either of these should work:
  await bobConversation.sendPreparedMessage(prepared);
  // await bob.sendPreparedMessage(prepared);

  await delayToPropogate();
  const messages = await bobConversation.messages()
  if (messages.length !== 1) {
    throw new Error(`expected 1 message: got ${messages.length}`);
  }
  const message = messages[0]

  return message?.id === prepared.messageId;
});


test("can list batch messages", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  const alice = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  if (bob.address === alice.address) {
    throw new Error("bob and alice should be different");
  }

  const bobConversation = await bob.conversations.newConversation(
    alice.address
  );
  await delayToPropogate();

  const aliceConversation = (await alice.conversations.list())[0];
  if (!aliceConversation) {
    throw new Error("aliceConversation should exist");
  }

  await bobConversation.send({ text: "Hello world" });
  const bobMessages = await bobConversation.messages();
  await bobConversation.send({
    reaction: {
      reference: bobMessages[0].id,
      action: "added",
      schema: "unicode",
      content: "💖",
    },
  });

  const bobMessages2 = await bobConversation.messages();

  await delayToPropogate();
  const messages: DecodedMessage[] = await alice.listBatchMessages([
    {
      contentTopic: bobConversation.topic,
    } as Query,
    {
      contentTopic: aliceConversation.topic,
    } as Query,
  ]);

  if (messages.length < 1) {
    throw Error("No message");
  }

  if (messages[0].contentTypeId !== "xmtp.org/reaction:1.0") {
    throw Error("Unexpected message content " + messages[0].content);
  }

  return true;
});

test("can paginate batch messages", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  const alice = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  if (bob.address === alice.address) {
    throw new Error("bob and alice should be different");
  }

  const bobConversation = await bob.conversations.newConversation(
    alice.address
  );
  await delayToPropogate();

  const aliceConversation = (await alice.conversations.list())[0];
  if (!aliceConversation) {
    throw new Error("aliceConversation should exist");
  }

  await bobConversation.send({ text: `Initial Message` });

  await delayToPropogate();
  const testTime = new Date();
  await delayToPropogate();

  for (let i = 0; i < 5; i++) {
    await bobConversation.send({ text: `Message ${i}` });
    await delayToPropogate();
  }

  const messagesLimited: DecodedMessage[] = await alice.listBatchMessages([
    {
      contentTopic: bobConversation.topic,
      pageSize: 2,
    } as Query,
  ]);

  const messagesAfter: DecodedMessage[] = await alice.listBatchMessages([
    {
      contentTopic: bobConversation.topic,
      startTime: testTime,
      endTime: new Date(),
    } as Query,
  ]);

  const messagesBefore: DecodedMessage[] = await alice.listBatchMessages([
    {
      contentTopic: bobConversation.topic,
      endTime: testTime,
    } as Query,
  ]);

  const messagesAsc: DecodedMessage[] = await alice.listBatchMessages([
    {
      contentTopic: bobConversation.topic,
      direction: "SORT_DIRECTION_ASCENDING",
    } as Query,
  ]);

  if (messagesLimited.length !== 2) {
    throw Error("Unexpected messagesLimited count " + messagesLimited.length);
  }
  if (messagesLimited[0].content.text !== "Message 4") {
    throw Error(
      "Unexpected messagesLimited content " + messagesLimited[0].content.text
    );
  }
  if (messagesLimited[1].content.text !== "Message 3") {
    throw Error(
      "Unexpected messagesLimited content " + messagesLimited[1].content.text
    );
  }

  if (messagesBefore.length !== 1) {
    throw Error("Unexpected messagesBefore count " + messagesBefore.length);
  }
  if (messagesBefore[0].content.text !== "Initial Message") {
    throw Error(
      "Unexpected messagesBefore content " + messagesBefore[0].content.text
    );
  }

  if (messagesAfter.length !== 5) {
    throw Error("Unexpected messagesAfter count " + messagesAfter.length);
  }
  if (messagesAfter[0].content.text !== "Message 4") {
    throw Error(
      "Unexpected messagesAfter content " + messagesAfter[0].content.text
    );
  }

  if (messagesAsc[0].content.text !== "Initial Message") {
    throw Error(
      "Unexpected messagesAsc content " + messagesAsc[0].content.text
    );
  }

  return true;
});

test("can stream messages", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  const alice = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();

  // Record new conversation stream
  const allConversations: Conversation[] = [];
  await alice.conversations.stream(async (conversation) => {
    allConversations.push(conversation);
  });

  // Record message stream across all conversations
  const allMessages: DecodedMessage[] = [];
  await alice.conversations.streamAllMessages(async (message) => {
    allMessages.push(message);
  });

  // Start Bob starts a new conversation.
  const bobConvo = await bob.conversations.newConversation(alice.address, {
    conversationID: "https://example.com/alice-and-bob",
    metadata: {
      title: "Alice and Bob",
    },
  });
  await delayToPropogate();

  if (bobConvo.clientAddress !== bob.address) {
    throw Error("Unexpected client address " + bobConvo.clientAddress);
  }
  if (!bobConvo.topic) {
    throw Error("Missing topic " + bobConvo.topic);
  }
  if (
    bobConvo.context?.conversationID !== "https://example.com/alice-and-bob"
  ) {
    throw Error(
      "Unexpected conversationID " + bobConvo.context?.conversationID
    );
  }
  if (bobConvo.context?.metadata?.title !== "Alice and Bob") {
    throw Error(
      "Unexpected metadata title " + bobConvo.context?.metadata?.title
    );
  }
  if (!bobConvo.createdAt) {
    console.log("bobConvo", bobConvo);
    throw Error("Missing createdAt " + bobConvo.createdAt);
  }

  if (allConversations.length !== 1) {
    throw Error(
      "Unexpected all conversations count " + allConversations.length
    );
  }
  if (allConversations[0].topic !== bobConvo.topic) {
    throw Error(
      "Unexpected all conversations topic " + allConversations[0].topic
    );
  }

  const aliceConvo = (await alice.conversations.list())[0];
  if (!aliceConvo) {
    throw new Error("missing conversation");
  }

  // Record message stream for this conversation
  const convoMessages: DecodedMessage[] = [];
  await aliceConvo.streamMessages(async (message) => {
    convoMessages.push(message);
  });

  for (let i = 0; i < 5; i++) {
    await bobConvo.send({ text: `Message ${i}` });
    await delayToPropogate();
  }
  if (allMessages.length !== 5) {
    throw Error("Unexpected all messages count " + allMessages.length);
  }
  if (convoMessages.length !== 5) {
    throw Error("Unexpected convo messages count " + convoMessages.length);
  }
  for (let i = 0; i < 5; i++) {
    if (allMessages[i].content.text !== `Message ${i}`) {
      throw Error(
        "Unexpected all message content " + allMessages[i].content.text
      );
    }
    if (allMessages[i].topic !== bobConvo.topic) {
      throw Error("Unexpected all message topic " + allMessages[i].topic);
    }
    if (convoMessages[i].content.text !== `Message ${i}`) {
      throw Error(
        "Unexpected convo message content " + convoMessages[i].content.text
      );
    }
    if (convoMessages[i].topic !== bobConvo.topic) {
      throw Error("Unexpected convo message topic " + convoMessages[i].topic);
    }
  }
  alice.conversations.cancelStream();
  alice.conversations.cancelStreamAllMessages();

  return true;
});

test("remote attachments should work", async () => {
  const alice = await XMTP.Client.createRandom({ env: "local" });
  const bob = await XMTP.Client.createRandom({ env: "local" });
  const convo = await alice.conversations.newConversation(bob.address);

  // Alice is sending Bob a file from her phone.
  const filename = `${Date.now()}.txt`;
  const file = `${fs.dirs.CacheDir}/${filename}`;
  await fs.writeFile(file, "hello world", "utf8");
  const { encryptedLocalFileUri, metadata } = await alice.encryptAttachment({
    fileUri: `file://${file}`,
    mimeType: "text/plain",
  });

  let encryptedFile = encryptedLocalFileUri.slice("file://".length);
  let originalContent = await fs.readFile(file, "base64");
  let encryptedContent = await fs.readFile(encryptedFile, "base64");
  if (encryptedContent === originalContent) {
    throw new Error("encrypted file should not match original");
  }

  // This is where the app will upload the encrypted file to a remote server and generate a URL.
  //   let url = await uploadFile(encryptedLocalFileUri);
  let url = "https://example.com/123";

  // Together with the metadata, we send the URL as a remoteAttachment message to the conversation.
  await convo.send({
    remoteAttachment: {
      ...metadata,
      scheme: "https://",
      url,
    },
  });
  await delayToPropogate();

  // Now we should see the remote attachment message.
  const messages = await convo.messages();
  if (messages.length !== 1) {
    throw new Error("Expected 1 message");
  }
  const message = messages[0];

  if (message.contentTypeId !== "xmtp.org/remoteStaticAttachment:1.0") {
    throw new Error("Expected correctly formatted typeId");
  }
  if (!message.content.remoteAttachment) {
    throw new Error("Expected remoteAttachment");
  }
  if (message.content.remoteAttachment.url !== "https://example.com/123") {
    throw new Error("Expected url to match");
  }

  // This is where the app prompts the user to download the encrypted file from `url`.
  // TODO: let downloadedFile = await downloadFile(url);
  // But to simplify this test, we're just going to copy
  // the previously encrypted file and pretend that we just downloaded it.
  let downloadedFileUri = `file://${fs.dirs.CacheDir}/${Date.now()}.bin`;
  await fs.cp(
    new URL(encryptedLocalFileUri).pathname,
    new URL(downloadedFileUri).pathname
  );

  // Now we can decrypt the downloaded file using the message metadata.
  const attached = await alice.decryptAttachment({
    encryptedLocalFileUri: downloadedFileUri,
    metadata: message.content.remoteAttachment,
  });
  if (attached.mimeType !== "text/plain") {
    throw new Error("Expected mimeType to match");
  }
  if (attached.filename !== filename) {
    throw new Error(`Expected ${attached.filename} to equal ${filename}`);
  }
  const text = await fs.readFile(new URL(attached.fileUri).pathname, "utf8");
  if (text !== "hello world") {
    throw new Error("Expected text to match");
  }
  return true;
});

test("can send read receipts", async () => {
  const bob = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  const alice = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  if (bob.address === alice.address) {
    throw new Error("bob and alice should be different");
  }

  const bobConversation = await bob.conversations.newConversation(
    alice.address
  );
  await delayToPropogate();

  const aliceConversation = (await alice.conversations.list())[0];
  if (!aliceConversation) {
    throw new Error("aliceConversation should exist");
  }

  await bobConversation.send({ readReceipt: {}});

  const bobMessages = await bobConversation.messages();

  if (bobMessages.length < 1) {
    throw Error("No message");
  }

  if (bobMessages[0].contentTypeId !== "xmtp.org/readReceipt:1.0") {
    throw Error("Unexpected message content " + bobMessages[0].content);
  }

  return true;
});

test("can stream all messages", async () => {
  const bo = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();
  const alix = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();

  // Record message stream across all conversations
  const allMessages: DecodedMessage[] = [];
  await alix.conversations.streamAllMessages(async (message) => {
    allMessages.push(message);
  });

  // Start Bob starts a new conversation.
  const boConvo = await bo.conversations.newConversation(alix.address);
  await delayToPropogate();

  for (let i = 0; i < 5; i++) {
    await boConvo.send({ text: `Message ${i}` });
    await delayToPropogate();
  }
  if (allMessages.length !== 5) {
    throw Error("Unexpected all messages count " + allMessages.length);
  }

  // Starts a new conversation.
  const caro = await XMTP.Client.createRandom({ env: "local" });
  const caroConvo = await caro.conversations.newConversation(alix.address);
  await delayToPropogate();
  for (let i = 0; i < 5; i++) {
    await caroConvo.send({ text: `Message ${i}` });
    await delayToPropogate();
  }
  if (allMessages.length !== 10) {
    throw Error("Unexpected all messages count " + allMessages.length);
  }

  alix.conversations.cancelStreamAllMessages();

  await alix.conversations.streamAllMessages(async (message) => {
    allMessages.push(message);
  });

  for (let i = 0; i < 5; i++) {
    await boConvo.send({ text: `Message ${i}` });
    await delayToPropogate();
  }
  if (allMessages.length <= 10) {
    throw Error("Unexpected all messages count " + allMessages.length);
  }


  return true;
});

test("canManagePreferences", async () => {
  const bo = await XMTP.Client.createRandom({ env: "local" });
  const alix = await XMTP.Client.createRandom({ env: "local" });
  await delayToPropogate();

  const alixConversation = await bo.conversations.newConversation(
      alix.address,
  );
  await delayToPropogate();

  const initialConvoState = await alixConversation.consentState();
  if (initialConvoState != "allowed") {
    throw new Error(`conversations created by bo should be allowed by default not ${initialConvoState}`);
  }

  const initialState = await bo.contacts.isAllowed(alixConversation.peerAddress);
  if (!initialState) {
    throw new Error(`contacts created by bo should be allowed by default not ${initialState}`);
  }

  bo.contacts.block([alixConversation.peerAddress]);
  await delayToPropogate();

  const blockedState = await bo.contacts.isBlocked(alixConversation.peerAddress);
  const allowedState = await bo.contacts.isAllowed(alixConversation.peerAddress);
  if (!blockedState) {
    throw new Error(`contacts blocked by bo should be blocked not ${blockedState}`);
  }

  if (allowedState) {
    throw new Error(`contacts blocked by bo should be blocked not ${allowedState}`);
  }

  const convoState = await alixConversation.consentState();
  await delayToPropogate();

  if (convoState != "blocked") {
    throw new Error(`conversations blocked by bo should be blocked not ${convoState}`);
  }
  
  return true
});

