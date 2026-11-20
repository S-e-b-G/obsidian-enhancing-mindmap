import INode from './INode'
import MindMap  from './mindmap';

export abstract class Command {
    name:string;
    mind?:any;
    constructor(name:string) {
        this.name = name;
    }
    execute(): boolean {return false}
    undo() {}
    redo() {
        this.execute();
    }
    refresh(mind?:any){
            var m = mind||this.mind;
            if(m){
                m.emit('renderEditNode',{});
                m.emit('mindMapChange',{});
            }
    }
}

export class AddNode extends Command {
    node:INode;
    parent:INode;
    mind:MindMap;
    index:number = -1;
    constructor(node:INode, parent:INode, mind?:MindMap) {
        super('addNode');
        this.node = node;
        this.parent = parent;
        this.mind = mind||this.node.mindmap;
    }
    execute():boolean {
        if (this.index > -1) {
            this.mind.addNode(this.node, this.parent, this.index);   //add node to position of parent children
        } else {
            this.mind.addNode(this.node, this.parent);
        }
        this.node.refreshBox();
        this.refresh();
        this.mind.clearSelectNode();
        setTimeout(()=>{
            this.node.select();
            this.node.edit();
        },0);
        return true; //exit with no error
    }

    undo() {
        var p = this.node.parent;
        this.index = this.mind.removeNode(this.node);
        this.mind.clearSelectNode();
        setTimeout(()=>{
            this.refresh();
            p&&p.select();
        },0)
    }
}


export class RemoveNode extends Command {
    node:INode;
    parent?:INode;
    mind:MindMap;
    index:number = -1;
    constructor(node:INode, mind?:MindMap) {
        super('removeNode');
        this.node = node;
        this.parent = this.node.parent;
        this.mind = mind||this.node.mindmap;
    }
    execute():boolean {
        if(this.node.data.isRoot == true){
            return false;
        }
        if (!this.parent) {
            throw new Error('Cannot remove a node without its parent');
        }
        this.node.clearCacheData();
        this.mind.clearSelectNode();
        this.index = this.mind.removeNode(this.node);
        this.refresh();
        this.parent && this.parent.select();
        return true; //exit with no error
    }

    undo() {
        if (!this.parent) {
            throw new Error('Cannot restore a removed node without its parent');
        }
        this.mind.addNode(this.node, this.parent, this.index);
        this.node.clearCacheData();
        this.node.refreshBox();
        this.mind.clearSelectNode();
        this.refresh();
        setTimeout(()=>{
            this.node.select();
        },0)
    }
}


export class ChangeNodeText extends Command {
    node:INode;
    oldText:string;
    text:string;
    isFirst:boolean;
    constructor(node:INode, oldText:string, text:string) {
        super('changeNodeText');
        this.node = node;
        this.oldText = oldText;
        this.text = text;
        this.isFirst = true;
    }
    execute():boolean {
        this.node.previousText = this.oldText;
        //if(!this.isFirst){
            this.node.setText(this.text);
        //}
        this.node.refreshBox();
        this.node.clearCacheData();
        this.refresh(this.node.mindmap);
        return true; //exit with no error
    }
    undo() {
        this.node.previousText = this.text;
        this.node.setText(this.oldText);
        this.node.clearCacheData();
        this.node.refreshBox();
        this.refresh(this.node.mindmap);
        this.isFirst =false;
    }
}

export class MoveNode extends Command {
    data:any={};
    node:INode;
    oldParent:INode;
    parent?:INode;
    newParent?:INode;
    dropNode?:INode;
    type?:string;
    index:number = -1;
    constructor(data:any) {
        super('moveNode');
        if (!data?.node?.parent || (data.type !== 'child' && data.type !== 'siblings')) {
            throw new Error('Cannot move a node without its original parent and a valid move type');
        }
        this.data = data;
        this.node = data.node;
        this.oldParent = data.node.parent;
        if (this.data.type.indexOf('child') > -1) {
            if (!data.parent) {
                throw new Error('Cannot move a node without a destination parent');
            }
            this.parent = this.data.parent;
        } else {
            this.dropNode = this.data.dropNode;
            this.newParent = this.dropNode?.parent;
            if (!this.dropNode || !this.newParent) {
                throw new Error('Cannot move a node next to a node without a parent');
            }
            this.type = this.data.direct;
        }
    }

    execute():boolean {
        if (this.data.type.indexOf('child') > -1) {
            const parent = this.parent;
            if (!parent) {
                throw new Error('Cannot move a node without a destination parent');
            }
            this.node.mindmap.clearSelectNode();
            this.index = this.oldParent.removeChild(this.node)
            parent.addChild(this.node);
            this.node.mindmap.traverseBF((n:INode) => {
                n.boundingRect = null;
                n.stroke = ''
            }, this.node);

            this.node.clearCacheData();
            this.oldParent.clearCacheData();
            this.refresh(this.node.mindmap);
            this.node.select();
        } else {
            if (!this.newParent || !this.dropNode) {
                throw new Error('Cannot move a node next to a node without a parent');
            }

            this.node.mindmap.clearSelectNode();
            this.index = this.oldParent.removeChild(this.node);
            this.node.mindmap.traverseBF((n:INode) => {
                n.boundingRect = null;
                n.stroke = ''
            }, this.node);

            this.oldParent.clearCacheData();
            var dropNodeIndex = this.newParent.children.indexOf(this.dropNode);

            if (this.type == 'top' || this.type == 'left') {
                this.newParent.addChild(this.node, dropNodeIndex)
            }
            else {
                this.newParent.addChild(this.node, dropNodeIndex + 1);
            }

            this.node.clearCacheData();
            this.refresh(this.node.mindmap);
            this.node.select();
        }
        return true; //exit with no error
    }

    undo() {
        if (this.data.type.indexOf('child') > -1) {
            const parent = this.parent;
            if (!parent) {
                throw new Error('Cannot undo a node move without its destination parent');
            }
            this.node.mindmap.clearSelectNode();
            parent.removeChild(this.node);
            this.oldParent.addChild(this.node, this.index);

            this.node.mindmap.traverseBF((n:INode) => {
                n.boundingRect = null;
                n.stroke = ''
            }, this.node);

            parent.clearCacheData();
            this.node.clearCacheData();
            this.refresh(this.node.mindmap);
            this.node.select();
        }
        else {
            if (!this.newParent || !this.dropNode || !this.oldParent) {
                throw new Error('Cannot undo a node move without its original and destination parents');
            }
            this.node.mindmap.clearSelectNode();
            this.newParent.removeChild(this.node);
            this.dropNode.clearCacheData();
            this.oldParent.addChild(this.node, this.index);
            this.node.clearCacheData();
            this.refresh(this.node.mindmap);
            this.node.select();
        }
    }
}


export class MovePos extends Command {
    node:INode;
    oldPos:any;
    newPos:any;
    constructor(node:INode, oldPos:any, newPos:any) {
        super('movePos');
        this.node = node;
        this.oldPos = oldPos;
        this.newPos = newPos;
    }

    execute():boolean {
        this.node.setPosition(this.newPos.x, this.newPos.y);
        this.refresh(this.node.mindmap);
        return true; //exit with no error
    }

    undo() {
        this.node.setPosition(this.oldPos.x, this.oldPos.y);
        this.refresh(this.node.mindmap);
    }
}

export class CollapseNode extends Command{
   node:INode;
   constructor(node:INode){
       super('collapseNOde')
       this.node = node;
       this.node.mindmap.clearSelectNode();

       this.node.refreshBox();
   }
   execute(){
       this.node.clearCacheData();
       this.node.collapse();
       this.refresh(this.node.mindmap);
       this.node.select();
       return true; //exit with no error
   }
   undo(){
    this.node.clearCacheData();
    this.node.expand();
    this.refresh(this.node.mindmap);
    this.node.select();
   }
}

export class ExpandNode extends Command{
    node:INode;
    constructor(node:INode){
        super('collapseNOde')
        this.node = node;
        this.node.mindmap.clearSelectNode();
        this.node.refreshBox();
    }
    execute(){
        this.node.clearCacheData();
        this.node.expand();
        this.refresh(this.node.mindmap);
        this.node.select();
        return true; //exit with no error
    }
    undo(){
     this.node.clearCacheData();
     this.node.collapse();
     this.refresh(this.node.mindmap);
     this.node.select();
    }
 }


export class JoinNodes extends Command {
    node: INode;
    joinedNode: INode;
    parent: INode;
    index: number;
    mind: MindMap;
    textChange: ChangeNodeText;
    pastes: PasteNode[];
    wasExpanded: boolean;

    constructor(node: INode, joinedNode: INode, text: string) {
        super('joinNodes');
        if (!joinedNode.parent || node.parent !== joinedNode.parent || node === joinedNode) {
            throw new Error('Cannot join a node without another sibling');
        }
        this.node = node;
        this.joinedNode = joinedNode;
        this.parent = joinedNode.parent;
        this.index = this.parent.children.indexOf(joinedNode);
        this.mind = node.mindmap;
        this.textChange = new ChangeNodeText(node, node.data.text, text);
        this.pastes = joinedNode.children.map(child => {
            const copied = JSON.parse(this.mind.copyNode(child));
            return new PasteNode(node, copied.text);
        });
        this.wasExpanded = node.isExpand;
    }

    execute(): boolean {
        this.textChange.execute();
        if (this.pastes.length && !this.node.isExpand) {
            this.node.expand();
            this.node.clearCacheData();
        }
        this.pastes.forEach(paste => {
            if (paste.firstNode) {
                this.mind.addNode(paste.firstNode, this.node);
            } else {
                paste.execute();
            }
        });
        this.mind.removeNode(this.joinedNode);
        this.finish();
        return true;
    }

    undo() {
        this.mind.addNode(this.joinedNode, this.parent, this.index);
        for (let i = this.pastes.length - 1; i >= 0; i--) {
            this.pastes[i].undo();
        }
        if (!this.wasExpanded && this.pastes.length) {
            this.node.collapse();
        }
        this.textChange.undo();
        this.finish();
    }

    finish() {
        this.mind.clearSelectNode();
        this.node.clearCacheData();
        this.refresh(this.mind);
        this.mind.scale(this.mind.mindScale);
        this.node.select();
    }
}

 export class PasteNode extends Command {
    node:INode
    data:any
    waitCollapse:any[]=[]
    firstNode?:INode
    constructor(node:any, data:any) {
        super('copyNode');
        this.node = node;
        this.data = data;
        this.mind= this.node.mindmap;
        this.waitCollapse = [];
    }

    execute():boolean {
        this.paste();
        return true; //exit with no error
    }

    undo() {
        if (this.firstNode) {
            this.mind.removeNode(this.firstNode);
            this.node.clearCacheData();
           // this.updateItems(this.node);
            this.refresh(this.node.mindmap);
        }
    }

    paste() {
        this.data.forEach((d:any, i:number) => {

            var n = new INode(d, this.mind);

            n.mindmap = this.mind;
            if (!d.isExpand) {
                this.waitCollapse.push(n);
            }
            if (i == 0) {
                n.data.pid = this.node.getId();
                this.mind.addNode(n, this.node);
                this.firstNode = n;
                n.setPosition(0,0);
                n.refreshBox();

            }
            else {
                var parent = this.mind.getNodeById(d.pid);
                if (parent) {
                   this.mind.addNode(n, parent);
                   n.setPosition(0,0);
                   n.refreshBox();

                }
            }

            if (i == this.data.length - 1) {
                n.clearCacheData();
                this.refresh(this.mind);
            }
        });
    }
}
