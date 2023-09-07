import { Context, Schema } from 'koishi'

import { ChatHubPlugin } from "@dingyi222666/koishi-plugin-chathub/lib/services/chat"

export function apply(context: Context, config: Config) {

}

export const name = '@dingyi222666/chathub-knowledge-chat'

export interface Config extends ChatHubPlugin.Config {

}

export const Config = Schema.intersect([
    Schema.object({

    }).description('基础配置'),
]) as Schema<Config>


export const using = ['chathub']

