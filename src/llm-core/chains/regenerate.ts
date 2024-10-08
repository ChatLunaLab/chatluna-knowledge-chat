/* eslint-disable max-len */
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { BaseRetriever } from '@langchain/core/retrievers'
import { PromptTemplate } from '@langchain/core/prompts'
import { BaseMessage } from '@langchain/core/messages'
import { Context } from 'koishi'
import { Chain } from './type'

// eslint-disable-next-line @typescript-eslint/naming-convention
const question_generator_template = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question} (The original question needs to be output in the language of the question, and if the question is in Chinese, the question should also be generated in Chinese)
Standalone question:`

function cropMessages(message: BaseMessage[]) {
    return message
        .slice(-20)
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

function chain(llm: ChatLunaChatModel, baseRetriever: BaseRetriever) {
    const questionGeneratorChainPrompt = PromptTemplate.fromTemplate(
        question_generator_template
    )

    const questionGeneratorChain = questionGeneratorChainPrompt.pipe(llm)

    return async (query: string, chatHistory: BaseMessage[]) => {
        if (chatHistory.length > 0) {
            const newQuestion = await questionGeneratorChain.invoke({
                question: query,
                chat_history: cropMessages(chatHistory)
            })

            const content = newQuestion.content as string
            if (content.length > 0) {
                query = content
            }
        }

        return await baseRetriever.invoke(query)
    }
}

export function apply(ctx: Context, chains: Record<string, Chain>) {
    chains['regenerate'] = chain
}
