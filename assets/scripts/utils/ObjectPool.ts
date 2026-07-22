import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * ObjectPool - 通用对象池
 *
 * 用于复用频繁创建/销毁的对象（子弹、敌人等），减少 GC 压力
 *
 * 用法：
 *  const pool = new ObjectPool();
 *  pool.init(prefab, 20, parentNode);
 *  const node = pool.get();
 *  pool.put(node);
 */
export class ObjectPool {
    private _prefab: Prefab | null = null;
    private _pool: Node[] = [];
    private _activeCount: number = 0;

    /**
     * 初始化对象池
     * @param prefab 预制体
     * @param preAllocate 预分配数量
     * @param parent 父节点
     */
    public init(prefab: Prefab, preAllocate: number = 10, parent?: Node): void {
        this._prefab = prefab;
        for (let i = 0; i < preAllocate; i++) {
            const node = instantiate(prefab);
            node.active = false;
            if (parent) {
                node.parent = parent;
            }
            this._pool.push(node);
        }
    }

    /**
     * 从池中获取一个节点（如池空则新建）
     */
    public get(parent?: Node): Node {
        let node: Node;
        if (this._pool.length > 0) {
            node = this._pool.pop()!;
        } else if (this._prefab) {
            node = instantiate(this._prefab);
        } else {
            return new Node();
        }
        node.active = true;
        if (parent && node.parent !== parent) {
            node.parent = parent;
        }
        this._activeCount++;
        return node;
    }

    /**
     * 将节点归还池中
     */
    public put(node: Node): void {
        node.active = false;
        this._pool.push(node);
        this._activeCount = Math.max(0, this._activeCount - 1);
    }

    /**
     * 清空池中所有节点
     */
    public clear(): void {
        for (const node of this._pool) {
            if (node.isValid) {
                node.destroy();
            }
        }
        this._pool.length = 0;
        this._activeCount = 0;
    }

    public get PoolSize(): number {
        return this._pool.length;
    }

    public get ActiveCount(): number {
        return this._activeCount;
    }
}
