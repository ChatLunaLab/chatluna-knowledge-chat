import { SystemPrompts } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/chain/base'
import { ChatHubChatModel } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/platform/model'
import { CallbackManagerForChainRun } from 'langchain/callbacks'
import {
    BaseChain,
    ChainInputs,
    loadQAChain,
    QAChainParams,
    SerializedChatVectorDBQAChain
} from 'langchain/chains'
import { BaseRetriever } from 'langchain/schema/retriever'
import { PromptTemplate } from 'langchain/prompts'
import { BaseMessage, ChainValues } from 'langchain/schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>

/**
 * Interface for the input parameters of the
 * ConversationalRetrievalQAChain class.
 */
export interface ConversationalFastRetrievalQAChainInput extends ChainInputs {
    retriever: BaseRetriever
    combineDocumentsChain: BaseChain
    returnSourceDocuments?: boolean
    inputKey?: string
    llm: ChatHubChatModel
    systemPrompts?: SystemPrompts
}

export class ConversationalFastRetrievalQAChain
    extends BaseChain
    implements ConversationalFastRetrievalQAChainInput
{
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static lc_name() {
        return 'ConversationalFastRetrievalQAChain'
    }

    inputKey = 'question'

    chatHistoryKey = 'chat_history'

    get inputKeys() {
        return [this.inputKey, this.chatHistoryKey]
    }

    get outputKeys() {
        return this.combineDocumentsChain.outputKeys.concat(
            this.returnSourceDocuments ? ['sourceDocuments'] : []
        )
    }

    llm: ChatHubChatModel

    systemPrompts?: SystemPrompts

    retriever: BaseRetriever

    combineDocumentsChain: BaseChain

    returnSourceDocuments = false

    constructor(fields: ConversationalFastRetrievalQAChainInput) {
        super(fields)
        this.retriever = fields.retriever
        this.combineDocumentsChain = fields.combineDocumentsChain
        this.inputKey = fields.inputKey ?? this.inputKey
        this.returnSourceDocuments =
            fields.returnSourceDocuments ?? this.returnSourceDocuments
        this.llm = fields.llm
        this.systemPrompts = fields.systemPrompts
    }

    /**
     * Static method to convert the chat history input into a formatted
     * string.
     * @param chatHistory Chat history input which can be a string, an array of BaseMessage instances, or an array of string arrays.
     * @returns A formatted string representing the chat history.
     */
    static async getChatHistoryString(
        chatHistory: string | BaseMessage[] | string[][],
        llm: ChatHubChatModel,
        systemPrompt?: SystemPrompts
    ) {
        let historyMessages: BaseMessage[]

        if (Array.isArray(chatHistory)) {
            historyMessages = chatHistory as BaseMessage[]
        }

        if (systemPrompt) {
            historyMessages = systemPrompt.concat(historyMessages)
        }

        historyMessages = await llm.cropMessages(
            historyMessages,
            systemPrompt?.length ?? 1
        )

        // crop message

        return historyMessages
            .map((chatMessage) => {
                if (chatMessage._getType() === 'human') {
                    return `Human: ${chatMessage.content}`
                } else if (chatMessage._getType() === 'ai') {
                    return `Assistant: ${chatMessage.content}`
                } else if (chatMessage._getType() === 'system') {
                    return `System: ${chatMessage.content}`
                } else {
                    return `${chatMessage.content}`
                }
            })
            .join('\n')
    }

    /** @ignore */
    async _call(
        values: ChainValues,
        runManager?: CallbackManagerForChainRun
    ): Promise<ChainValues> {
        console.log(values)
        if (!(this.inputKey in values)) {
            throw new Error(`Question key ${this.inputKey} not found.`)
        }
        if (!(this.chatHistoryKey in values)) {
            throw new Error(
                `Chat history key ${this.chatHistoryKey} not found.`
            )
        }
        const question: string =
            values[this.inputKey] instanceof BaseMessage
                ? (values[this.inputKey] as BaseMessage).content
                : values[this.inputKey]
        const chatHistory: string =
            await ConversationalFastRetrievalQAChain.getChatHistoryString(
                values[this.chatHistoryKey],
                this.llm,
                this.systemPrompts
            )
        const newQuestion = question
        const docs = await this.retriever.getRelevantDocuments(
            newQuestion,
            runManager?.getChild('retriever')
        )
        const inputs = {
            question: newQuestion,
            input_documents: docs,
            chat_history: chatHistory
        }
        const result = await this.combineDocumentsChain.call(
            inputs,
            runManager?.getChild('combine_documents')
        )
        if (this.returnSourceDocuments) {
            return {
                ...result,
                sourceDocuments: docs
            }
        }
        return result
    }

    _chainType(): string {
        return 'conversational_fast_retrieval_chain'
    }

    static async deserialize(
        _data: SerializedChatVectorDBQAChain,
        _values: LoadValues
    ): Promise<ConversationalFastRetrievalQAChain> {
        throw new Error('Not implemented.')
    }

    serialize(): SerializedChatVectorDBQAChain {
        throw new Error('Not implemented.')
    }

    static fromLLM(
        llm: ChatHubChatModel,
        retriever: BaseRetriever,
        options: {
            outputKey?: string // not used
            returnSourceDocuments?: boolean
            /** @deprecated Pass in qaChainOptions.prompt instead */
            qaTemplate?: string
            qaChainOptions?: QAChainParams
        } & Omit<
            ConversationalFastRetrievalQAChainInput,
            | 'retriever'
            | 'combineDocumentsChain'
            | 'questionGeneratorChain'
            | 'llm'
        > = {}
    ): ConversationalFastRetrievalQAChain {
        const {
            qaTemplate,
            qaChainOptions = {
                type: 'stuff',
                prompt: qaTemplate
                    ? PromptTemplate.fromTemplate(qaTemplate)
                    : undefined
            },
            verbose,
            ...rest
        } = options

        const qaChain = loadQAChain(llm, qaChainOptions)

        const instance = new this({
            retriever,
            combineDocumentsChain: qaChain,
            verbose,
            llm,
            ...rest
        })
        return instance
    }
}
