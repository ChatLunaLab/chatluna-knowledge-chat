import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config } from '..'

export async function apply(ctx: Context, config: Config, chain: ChatChain): Promise<void> {
    ctx.command('chathub.knowledge', 'QA问题相关命令')

    ctx.command('chathub.knowledge.upload [path:string]', '上传资料')
        .option('size', '-ps --size <number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <string> 文件路径')
        .action(async ({ session }, path) => {})

    ctx.command('chathub.knowledge.delete [path:string]', '删除资料')
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ session }, path) => {})
}
