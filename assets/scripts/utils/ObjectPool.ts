import { Node, Prefab, instantiate, clone } from 'cc';

/**
 * ObjectPool - 通用对象池
 *
 * 支持 Prefab 或 Node 模板。
 * 使用 Node 模板时，通过 clone() 复制节点（用于运行时无 Prefab 的情况）。
 */
export class ObjectPool {
    private _prefab: Prefab | null = null;
    private _template: Node | null = null;
    private _pool: Node[] = [];
    private _activeCount: number = 0;

    /** 用 Prefab 初始化 */
    public init(prefab: Prefab, preAllocate: number = 10, parent?: Node): void {
        this._prefab = prefab;
        this._template = null;
        for (let i = 0; i < preAllocate; i++) {
            const node = instantiate(prefab);
            node.active = false;
            if (parent) node.parent = parent;
            this._pool.push(node);
        }
    }

    /** 用 Node 模板初始化（运行时无 Prefab 时使用） */
    public initWithTemplate(template: Node, preAllocate: number = 10, parent?: Node): void {
        this._prefab = null;
        this._template = template;
        for (let i = 0; i < preAllocate; i++) {
            const node = instantiate(template);
            node.active = false;
            if (parent) node.parent = parent;
            this._pool.push(node);
        }
    }

    public get(parent?: Node): Node {
        let node: Node;
        if (this._pool.length > 0) {
            node = this._pool.pop()!;
        } else if (this._prefab) {
            node = instantiate(this._prefab);
        } else if (this._template) {
            node = instantiate(this._template);
        } else {
            return new Node();
        }
        node.active = true;
        if (parent && node.parent !== parent) node.parent = parent;
        this._activeCount++;
        return node;
    }

    public put(node: Node): void {
        node.active = false;
        this._pool.push(node);
        this._activeCount = Math.max(0, this._activeCount - 1);
    }

    public clear(): void {
        for (const node of this._pool) {
            if (node.isValid) node.destroy();
        }
        this._pool.length = 0;
        this._activeCount = 0;
    }

    public get PoolSize(): number { return this._pool.length; }
    public get ActiveCount(): number { return this._activeCount; }
}
