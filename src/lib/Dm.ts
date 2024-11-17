import { InboxId } from './Client'
import { ConsentState } from './ConsentListEntry'
import { ConversationVersion, ConversationBase } from './Conversation'
import { DecodedMessage } from './DecodedMessage'
import { Member } from './Member'
import { ConversationSendPayload } from './types/ConversationCodecs'
import { DefaultContentTypes } from './types/DefaultContentType'
import { EventTypes } from './types/EventTypes'
import { MessageId, MessagesOptions } from './types/MessagesOptions'
import * as XMTP from '../index'
import { ConversationId, ConversationTopic } from '../index'

export interface DmParams {
  id: ConversationId
  createdAt: number
  topic: ConversationTopic
  consentState: ConsentState
  lastMessage?: DecodedMessage
}

export class Dm<ContentTypes extends DefaultContentTypes = DefaultContentTypes>
  implements ConversationBase<ContentTypes>
{
  client: XMTP.Client<ContentTypes>
  id: ConversationId
  createdAt: number
  version = ConversationVersion.DM as const
  topic: ConversationTopic
  state: ConsentState
  lastMessage?: DecodedMessage<ContentTypes>

  constructor(
    client: XMTP.Client<ContentTypes>,
    params: DmParams,
    lastMessage?: DecodedMessage<ContentTypes>
  ) {
    this.client = client
    this.id = params.id
    this.createdAt = params.createdAt
    this.topic = params.topic
    this.state = params.consentState
    this.lastMessage = lastMessage
  }

  /**
   * This method return the peer inbox id associated with the dm.
   * @returns {Promise<InboxId>} A Promise that resolves to a InboxId.
   */
  async peerInboxId(): Promise<InboxId> {
    return XMTP.dmPeerInboxId(this.client, this.id)
  }

  /**
   * Sends a message to the current dm.
   *
   * @param {string | MessageContent} content - The content of the message. It can be either a string or a structured MessageContent object.
   * @returns {Promise<string>} A Promise that resolves to a string identifier for the sent message.
   * @throws {Error} Throws an error if there is an issue with sending the message.
   */
  async send<SendContentTypes extends DefaultContentTypes = ContentTypes>(
    content: ConversationSendPayload<SendContentTypes>
  ): Promise<MessageId> {
    // TODO: Enable other content types
    // if (opts && opts.contentType) {
    // return await this._sendWithJSCodec(content, opts.contentType)
    // }

    try {
      if (typeof content === 'string') {
        content = { text: content }
      }

      return await XMTP.sendMessage(this.client.inboxId, this.id, content)
    } catch (e) {
      console.info('ERROR in send()', e.message)
      throw e
    }
  }

  /**
   * Prepare a dm message to be sent.
   *
   * @param {string | MessageContent} content - The content of the message. It can be either a string or a structured MessageContent object.
   * @returns {Promise<string>} A Promise that resolves to a string identifier for the prepared message to be sent.
   * @throws {Error} Throws an error if there is an issue with sending the message.
   */
  async prepareMessage<
    SendContentTypes extends DefaultContentTypes = ContentTypes,
  >(content: ConversationSendPayload<SendContentTypes>): Promise<string> {
    // TODO: Enable other content types
    // if (opts && opts.contentType) {
    // return await this._sendWithJSCodec(content, opts.contentType)
    // }

    try {
      if (typeof content === 'string') {
        content = { text: content }
      }

      return await XMTP.prepareMessage(this.client.inboxId, this.id, content)
    } catch (e) {
      console.info('ERROR in prepareMessage()', e.message)
      throw e
    }
  }

  /**
   * Publish all prepared messages.
   *
   * @throws {Error} Throws an error if there is an issue finding the unpublished message
   */
  async publishPreparedMessages() {
    try {
      return await XMTP.publishPreparedMessages(this.client.inboxId, this.id)
    } catch (e) {
      console.info('ERROR in publishPreparedMessages()', e.message)
      throw e
    }
  }

  /**
   * This method returns an array of messages associated with the dm.
   * To get the latest messages from the network, call sync() first.
   *
   * @param {number | undefined} limit - Optional maximum number of messages to return.
   * @param {number | undefined} before - Optional filter for specifying the maximum timestamp of messages to return.
   * @param {number | undefined} after - Optional filter for specifying the minimum timestamp of messages to return.
   * @param direction - Optional parameter to specify the time ordering of the messages to return.
   * @returns {Promise<DecodedMessage<ContentTypes>[]>} A Promise that resolves to an array of DecodedMessage objects.
   */
  async messages(
    opts?: MessagesOptions
  ): Promise<DecodedMessage<ContentTypes>[]> {
    return await XMTP.conversationMessages(
      this.client,
      this.id,
      opts?.limit,
      opts?.beforeNs,
      opts?.afterNs,
      opts?.direction
    )
  }

  /**
   * Executes a network request to fetch the latest messages and membership changes
   * associated with the dm and saves them to the local state.
   */
  async sync() {
    await XMTP.syncConversation(this.client.inboxId, this.id)
  }

  /**
   * Sets up a real-time message stream for the current dm.
   *
   * This method subscribes to incoming messages in real-time and listens for new message events.
   * When a new message is detected, the provided callback function is invoked with the details of the message.
   * Additionally, this method returns a function that can be called to unsubscribe and end the message stream.
   *
   * @param {Function} callback - A callback function that will be invoked with the new DecodedMessage when a message is received.
   * @returns {Function} A function that, when called, unsubscribes from the message stream and ends real-time updates.
   */
  async streamMessages(
    callback: (message: DecodedMessage<ContentTypes>) => Promise<void>
  ): Promise<() => void> {
    await XMTP.subscribeToMessages(this.client.inboxId, this.id)
    const messageSubscription = XMTP.emitter.addListener(
      EventTypes.ConversationMessage,
      async ({
        inboxId,
        message,
        conversationId,
      }: {
        inboxId: string
        message: DecodedMessage<ContentTypes>
        conversationId: string
      }) => {
        if (inboxId !== this.client.inboxId) {
          return
        }
        if (conversationId !== this.id) {
          return
        }

        message.client = this.client
        await callback(DecodedMessage.fromObject(message, this.client))
      }
    )
    return async () => {
      messageSubscription.remove()
      await XMTP.unsubscribeFromMessages(this.client.inboxId, this.id)
    }
  }

  async processMessage(
    encryptedMessage: string
  ): Promise<DecodedMessage<ContentTypes>> {
    try {
      return await XMTP.processMessage(this.client, this.id, encryptedMessage)
    } catch (e) {
      console.info('ERROR in processConversationMessage()', e)
      throw e
    }
  }

  async consentState(): Promise<ConsentState> {
    return await XMTP.conversationConsentState(this.client.inboxId, this.id)
  }

  async updateConsent(state: ConsentState): Promise<void> {
    return await XMTP.updateConversationConsent(
      this.client.inboxId,
      this.id,
      state
    )
  }

  /**
   *
   * @returns {Promise<Member[]>} A Promise that resolves to an array of Member objects.
   * To get the latest member list from the network, call sync() first.
   */
  async members(): Promise<Member[]> {
    return await XMTP.listConversationMembers(this.client.inboxId, this.id)
  }
}
