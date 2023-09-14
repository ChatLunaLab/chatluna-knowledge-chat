import { Document } from 'langchain/document'

export abstract class DocumentLoader {
    public abstract support(path: string): Promise<boolean>

    public abstract load(path: string): Promise<Document>
}
