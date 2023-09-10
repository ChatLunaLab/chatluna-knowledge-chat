import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config } from '..'

export async function apply(ctx: Context, config: Config, chain: ChatChain): Promise<void> {
    ctx.command('chathub.knowledge', 'QA问题相关命令')

    ctx.command('chathub.knowledge.upload [path:string]', '上传资料').action(
        async ({ session }, path) => {}
    )
}
