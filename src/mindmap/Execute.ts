import History from './History'
import * as cmd from './Cmds'
import { uuid } from './uuid'
import {t} from '../lang/helpers'
import INode from './INode'

interface DataProps {
    node?:INode,
    parent?:INode,
    oldParent?:INode,
    joinedNode?:INode,

    //change node text
    text?:string,
    oldText?:string,

    //change root position
    oldPos?:{
        x:number,
        y:number
    },
    newPos?:{
        x:number,
        y:number
    },

    // Add command to history
    inHistory?:boolean,

    data?:any
};

export default class Exec{
    history:History = new History(50);
    execute(name:string,data?:DataProps){
        var l_return = null;
        switch(name){
            case 'addChildNode':
            case 'addSiblingNode':
                if(data?.parent){
                    var d = {
                        id: uuid(),
                        text: data.text || t('Sub title')
                    }
                    const parent = data.parent;
                    const newNode = new INode(d,parent.mindmap);
                    this.history.execute(new cmd.AddNode(newNode, parent, parent.mindmap));
                    l_return = newNode;
                } else {
                    throw new Error('Cannot add a node without a parent');
                }
                break;
            case 'deleteNodeAndChild':
                if(data?.node){
                    const node = data.node;
                    this.history.execute(new cmd.RemoveNode(node, node.mindmap));
                } else {
                    throw new Error('Cannot delete a node without a selection');
                }
                break;
            case 'deleteNodeExcludeChild':
                break;
            case 'changeNodeText':
                if(data?.node && data.oldText !== undefined && data.text !== undefined){
                    this.history.execute(new cmd.ChangeNodeText(data.node, data.oldText, data.text));
                } else {
                    throw new Error('Cannot change node text without a node and its old and new text');
                }
                break;
            case 'joinNodes':
                if (data?.node && data.joinedNode && data.text !== undefined) {
                    this.history.execute(new cmd.JoinNodes(data.node, data.joinedNode, data.text));
                } else {
                    throw new Error('Cannot join nodes without both nodes and their combined text');
                }
                break;
            case 'moveNode':
                if (!data) {
                    throw new Error('Cannot move a node without move data');
                }
                console.log("inHistory:");
                console.log(data.inHistory);
                if(data.inHistory === undefined || data.inHistory == true) {
                    this.history.execute(new cmd.MoveNode(data));
                } else {// inHistory == false
                    (new cmd.MoveNode(data)).execute();
                }
                break;
            case 'movePosition':
                if(data?.node && data.oldPos && data.newPos){
                    this.history.execute(new cmd.MovePos(data.node,data.oldPos,data.newPos));
                } else {
                    throw new Error('Cannot move a position without a node and its old and new positions');
                }
                break
            case 'expandNode':
                if(data?.node){
                    this.history.execute(new cmd.ExpandNode(data.node));
                } else {
                    throw new Error('Cannot expand without a node');
                }
                break;
            case 'collapseNode':
                if(data?.node){
                    this.history.execute(new cmd.CollapseNode(data.node));
                } else {
                    throw new Error('Cannot collapse without a node');
                }
                break
            case 'pasteNode':
                if (!data?.node) {
                    throw new Error('Cannot paste without a destination node');
                }
                this.history.execute(new cmd.PasteNode(data.node,data.data));
                break;
       }

       return l_return;
    }


    undo(){
        this.history.undo()
    }

    redo(){
        this.history.redo()
    }
}