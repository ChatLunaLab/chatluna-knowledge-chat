import { Context, Schema } from 'koishi'

import { ChatHubPlugin } from "@dingyi222666/koishi-plugin-chathub/lib/services/chat"

class KnowledgeChatPlugin extends ChatHubPlugin<KnowledgeChatPlugin.Config> {
    name = '@dingyi222666/chathub-knowledge-chat'

    public constructor(protected ctx: Context, public readonly config: KnowledgeChatPlugin.Config) {
        super(ctx, config)

       
    }

}

namespace KnowledgeChatPlugin {
    export interface Config extends ChatHubPlugin.Config {
        
    }

    export const Config = Schema.intersect([
        Schema.object({
          
        }).description('请求配置'),
    ]) as Schema<KnowledgeChatPlugin.Config>


    export const using = ['chathub']
}

export default KnowledgeChatPlugin
