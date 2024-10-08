import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { BaseRetriever } from '@langchain/core/retrievers'
import { BaseMessage } from '@langchain/core/messages'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>

export function chain(llm: ChatLunaChatModel, baseRetriever: BaseRetriever) {
    return (query: string, chatHistory: BaseMessage[]) =>
        baseRetriever.invoke(query)
}
