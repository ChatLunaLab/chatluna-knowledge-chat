import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { ContextualCompressionRetriever } from 'langchain/retrievers/contextual_compression'
import { BaseRetriever } from '@langchain/core/retrievers'
import { PromptTemplate } from '@langchain/core/prompts'
import { LLMChainExtractor } from 'langchain/retrievers/document_compressors/chain_extract'
import { BaseOutputParser } from '@langchain/core/output_parsers'
import { BaseMessage } from '@langchain/core/messages'
import { Context } from 'koishi'
import { Chain } from './type'

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
        '@langchain/core/messages',
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

export function apply(ctx: Context, chains: Record<string, Chain>) {
    chains['contextual-compression'] = chain
}

function chain(llm: ChatLunaChatModel, baseRetriever: BaseRetriever) {
    const baseCompressor = LLMChainExtractor.fromLLM(
        llm,
        getDefaultChainPrompt()
    )

    const retriever = new ContextualCompressionRetriever({
        baseCompressor,
        baseRetriever
    })

    return (query: string, chatHistory: BaseMessage[]) =>
        retriever.invoke(query)
}
