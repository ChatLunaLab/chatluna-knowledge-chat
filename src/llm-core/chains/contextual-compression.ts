import { SystemPrompts } from 'koishi-plugin-chatluna/lib/llm-core/chain/base'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/lib/llm-core/platform/model'
import { CallbackManagerForChainRun } from 'langchain/callbacks'
import {
    BaseChain,
    ChainInputs,
    loadQAChain,
    QAChainParams,
    SerializedChatVectorDBQAChain
} from 'langchain/chains'
import { ContextualCompressionRetriever } from 'langchain/retrievers/contextual_compression'
import { BaseRetriever } from 'langchain/schema/retriever'
import { PromptTemplate } from 'langchain/prompts'
import { BaseMessage, ChainValues } from 'langchain/schema'
import { LLMChainExtractor } from 'langchain/retrievers/document_compressors/chain_extract'
import { BaseOutputParser } from 'langchain/schema/output_parser'
import { cropDocuments } from '../prompts/util'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>

/**
 * Interface for the input parameters of the
 * ConversationalRetrievalQAChain class.
 */
export interface ConversationalContextualCompressionRetrievalQAChainInput
    extends ChainInputs {
    retriever: BaseRetriever
    combineDocumentsChain: BaseChain
    returnSourceDocuments?: boolean
    inputKey?: string
    llm: ChatLunaChatModel
    systemPrompts?: SystemPrompts
}

export class ConversationalContextualCompressionRetrievalQAChain
    extends BaseChain
    implements ConversationalContextualCompressionRetrievalQAChainInput
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

    constructor(
        fields: ConversationalContextualCompressionRetrievalQAChainInput
    ) {
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
            null,
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
            await ConversationalContextualCompressionRetrievalQAChain.getChatHistoryString(
                values[this.chatHistoryKey],
                this.llm,
                this.systemPrompts
            )

        const newQuestion = question
        const docs = await cropDocuments(
            await this.retriever.getRelevantDocuments(
                newQuestion,
                runManager?.getChild('retriever')
            ),
            this.llm
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
        return 'conversational_fa_retrieval_chain'
    }

    static async deserialize(
        _data: SerializedChatVectorDBQAChain,
        _values: LoadValues
    ): Promise<ConversationalContextualCompressionRetrievalQAChain> {
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
            ConversationalContextualCompressionRetrievalQAChainInput,
            | 'retriever'
            | 'combineDocumentsChain'
            | 'questionGeneratorChain'
            | 'llm'
        > = {}
    ): ConversationalContextualCompressionRetrievalQAChain {
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

        const baseCompressor = LLMChainExtractor.fromLLM(
            llm,
            getDefaultChainPrompt()
        )

        const contextualCompressionRetriever =
            new ContextualCompressionRetriever({
                baseCompressor,
                baseRetriever: retriever
            })

        const instance = new this({
            retriever: contextualCompressionRetriever,
            combineDocumentsChain: qaChain,
            verbose,
            llm,
            ...rest
        })
        return instance
    }
}

function getDefaultChainPrompt(): PromptTemplate {
    const outputParser = new NoOutputParser()
    const template = PROMPT_TEMPLATE(outputParser.noOutputStr)
    return new PromptTemplate({
        template,
        inputVariables: ['question', 'context'],
        outputParser
    })
}

class NoOutputParser extends BaseOutputParser<string> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    lc_namespace = [
        'langchain',
        'retrievers',
        'document_compressors',
        'chain_extract'
    ]

    noOutputStr = 'NO_OUTPUT'

    parse(text: string): Promise<string> {
        const cleanedText = text.trim()
        if (cleanedText === this.noOutputStr) {
            return Promise.resolve('')
        }
        return Promise.resolve(cleanedText)
    }

    getFormatInstructions(): string {
        throw new Error('Method not implemented.')
    }
}

const PROMPT_TEMPLATE = (
    noOutputStr: string
    // eslint-disable-next-line max-len
) => `Given the following question and context, extract any part of the context *AS IS* that is relevant to answer the question. If none of the context is relevant return ${noOutputStr}.

  Remember, *DO NOT* edit the extracted parts of the context, and output in the origin language of the part.

  > Question: {question}
  > Context:
  >>>
  {context}
  >>>
  Extracted relevant parts:`
