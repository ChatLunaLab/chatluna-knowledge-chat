/* eslint-disable max-len */
import { SystemPrompts } from 'koishi-plugin-chatluna/lib/llm-core/chain/base'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/lib/llm-core/platform/model'
import { CallbackManagerForChainRun } from 'langchain/callbacks'
import {
    BaseChain,
    ChainInputs,
    LLMChain,
    loadQAChain,
    QAChainParams,
    SerializedChatVectorDBQAChain
} from 'langchain/chains'
import { BaseRetriever } from 'langchain/schema/retriever'
import { PromptTemplate } from 'langchain/prompts'
import { BaseMessage, ChainValues } from 'langchain/schema'

// eslint-disable-next-line @typescript-eslint/naming-convention
const question_generator_template = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question} (The original question needs to be output in the language of the question, and if the question is in Chinese, the question should also be generated in Chinese)
Standalone question:`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>

/**
 * Interface for the input parameters of the
 * ConversationalRetrievalQAChain class.
 */
export interface ConversationalRetrievalQAChainInput extends ChainInputs {
    retriever: BaseRetriever
    combineDocumentsChain: BaseChain
    returnSourceDocuments?: boolean
    inputKey?: string
    llm: ChatLunaChatModel
    systemPrompts?: SystemPrompts
    questionGeneratorChain: LLMChain
}

export class ConversationalRetrievalQAChain
    extends BaseChain
    implements ConversationalRetrievalQAChainInput
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

    llm: ChatLunaChatModel

    systemPrompts?: SystemPrompts

    retriever: BaseRetriever

    combineDocumentsChain: BaseChain

    returnSourceDocuments = false

    questionGeneratorChain: LLMChain

    constructor(fields: ConversationalRetrievalQAChainInput) {
        super(fields)
        this.retriever = fields.retriever
        this.combineDocumentsChain = fields.combineDocumentsChain
        this.inputKey = fields.inputKey ?? this.inputKey
        this.returnSourceDocuments =
            fields.returnSourceDocuments ?? this.returnSourceDocuments
        this.llm = fields.llm
        this.questionGeneratorChain = fields.questionGeneratorChain
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
        llm: ChatLunaChatModel,
        systemPrompt?: SystemPrompts
    ) {
        let historyMessages: BaseMessage[]

        if (Array.isArray(chatHistory)) {
            historyMessages = chatHistory as BaseMessage[]
        }

        if (systemPrompt) {
            historyMessages = systemPrompt.concat(historyMessages)
        }

        ;[historyMessages] = await llm.cropMessages(
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
            await ConversationalRetrievalQAChain.getChatHistoryString(
                values[this.chatHistoryKey],
                this.llm,
                this.systemPrompts
            )

        let newQuestion = question

        if (chatHistory.length > 0) {
            const result = await this.questionGeneratorChain.call(
                {
                    question,
                    chat_history: chatHistory
                },
                runManager?.getChild('question_generator')
            )
            const keys = Object.keys(result)
            if (keys.length === 1) {
                newQuestion = result[keys[0]]
            } else {
                throw new Error(
                    'Return from llm chain has multiple values, only single values supported.'
                )
            }
        }

        console.log(newQuestion)

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
        return 'conversational_retrieval_chain'
    }

    static async deserialize(
        _data: SerializedChatVectorDBQAChain,
        _values: LoadValues
    ): Promise<ConversationalRetrievalQAChain> {
        throw new Error('Not implemented.')
    }

    serialize(): SerializedChatVectorDBQAChain {
        throw new Error('Not implemented.')
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        retriever: BaseRetriever,
        options: {
            outputKey?: string // not used
            returnSourceDocuments?: boolean
            /** @deprecated Pass in qaChainOptions.prompt instead */
            qaTemplate?: string
            qaChainOptions?: QAChainParams
        } & Omit<
            ConversationalRetrievalQAChainInput,
            | 'retriever'
            | 'combineDocumentsChain'
            | 'questionGeneratorChain'
            | 'llm'
        > = {}
    ): ConversationalRetrievalQAChain {
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

        const questionGeneratorChainPrompt = PromptTemplate.fromTemplate(
            question_generator_template
        )

        const questionGeneratorChain = new LLMChain({
            prompt: questionGeneratorChainPrompt,
            llm,
            verbose
        })

        const instance = new this({
            retriever,
            combineDocumentsChain: qaChain,
            verbose,
            llm,
            questionGeneratorChain,
            ...rest
        })
        return instance
    }
}
