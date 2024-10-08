import { BaseMessage } from '@langchain/core/messages'
import { BaseRetriever } from '@langchain/core/retrievers'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { Document } from '@langchain/core/documents'

export type Chain = (
    llm: ChatLunaChatModel,
    baseRetriever: BaseRetriever
) => (query: string, chatHistory: BaseMessage[]) => Promise<Document[]>
