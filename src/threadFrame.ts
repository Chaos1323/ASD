import { DebugVariable, Handles, JavaFrame } from "./interfaces_classes";
import { JdwpType } from "./JDWPConstants";

export class ThreadFrameManager {
    private stackFrameHandles : Handles<JavaFrame>;
    private variableHandles : Handles<DebugVariable>;
    private threadFrames : {[key : number] : JavaFrame[]} = {};
    private frameVariables : {[key : number] : DebugVariable[]} = {};

    constructor()
    {
        this.stackFrameHandles = new Handles<JavaFrame>();
        this.variableHandles = new Handles<DebugVariable>();
    }

    public reset() : void{
        this.stackFrameHandles.clear();
        this.variableHandles.clear();
        this.threadFrames = {};
        this.frameVariables = {};
    }

    public getFrameFromId(frameId : number) : JavaFrame | undefined
    {
        return this.stackFrameHandles.get(frameId);
    }

    public getVariableFromId(varId : number) : DebugVariable | undefined
    {
        return this.variableHandles.get(varId);
    }

    public getVariableFromName(frameId : number, varName : string) : DebugVariable | undefined
    {
        let vars : DebugVariable[] | undefined = this.frameVariables[frameId];
        if (vars)
        {
            for (let i = 0; i < vars.length; i++)
            {
                if (varName == vars[i].name)
                {
                    return vars[i];
                }
            }
        }

        return undefined;
    }

    public addThreadFrame(vsid : number, frame : JavaFrame) : number
    {
        let frames : JavaFrame[] | undefined = this.threadFrames[vsid];
        if (!frames)
        {
            frames = [];
            this.threadFrames[vsid] = frames;
        }

        frames.push(frame);
        frame.handleID = this.stackFrameHandles.create(frame);
        return frame.handleID;
    }

    public removeThreadFrames(vsid : number) : void
    {
        let frames : JavaFrame[] | undefined = this.threadFrames[vsid];
        if (frames)
        {
            //clean the frame
            for (let i = 0; i < frames.length; i++)
            {
                //clean variable
                let vars : DebugVariable[] | undefined = this.frameVariables[frames[i].handleID];
                for (let j = 0; vars && j < vars.length; j++)
                {
                    this.variableHandles.erase(vars[j].id);
                }

                delete this.frameVariables[frames[i].handleID];
                this.stackFrameHandles.erase(frames[i].handleID);
            }
        }

        delete this.threadFrames[vsid];
    }

    public addFrameVariable(frameid : number, variable : DebugVariable) : number
    {
        let vars : DebugVariable[] | undefined = this.frameVariables[frameid];
        if (!vars)
        {
            vars = this.frameVariables[frameid] = [];
        }

        vars.push(variable);
        variable.id = this.variableHandles.create(variable);
        return variable.id;
    }

    public updateDebugVariableValue(variable: DebugVariable) {
        variable.value = "get-error";
        variable.type = variable.orignalValue.tag;
        switch (variable.orignalValue.tag) {
            case JdwpType.JT_ARRAY:
                if (undefined != variable.orignalValue.value.A)
                {
                    variable.realValue = variable.orignalValue.value.A;
                    let size : number = variable.size?variable.size:0;
                    variable.value = (variable.realType?variable.realType:"") + `[${size.toString()}]`;
                    variable.referenceId = variable.id;
                }
                break;
            case JdwpType.JT_BYTE:
                if (undefined != variable.orignalValue.value.B)
                {
                    variable.realValue = variable.orignalValue.value.B;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_CHAR:
                if (undefined != variable.orignalValue.value.C)
                {
                    variable.realValue = variable.orignalValue.value.C;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_OBJECT:
                if (undefined != variable.orignalValue.value.L)
                {
                    variable.realValue = variable.orignalValue.value.L;
                    variable.value = (variable.realType?variable.realType:"") + `@${variable.realValue.toString(16)}`;
                    variable.referenceId = variable.id;
                }
                break;
            case JdwpType.JT_FLOAT:
                if (undefined != variable.orignalValue.value.F)
                {
                    variable.realValue = variable.orignalValue.value.F;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_DOUBLE:
                if (undefined != variable.orignalValue.value.D)
                {
                    variable.realValue = variable.orignalValue.value.D;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_INT:
                if (undefined != variable.orignalValue.value.I)
                {
                    variable.realValue = variable.orignalValue.value.I;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_LONG:
                if (undefined != variable.orignalValue.value.J)
                {
                    variable.realValue = variable.orignalValue.value.J;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_SHORT:
                if (undefined != variable.orignalValue.value.S)
                {
                    variable.realValue = variable.orignalValue.value.S;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_VOID:
                break;
            case JdwpType.JT_BOOLEAN:
                if (undefined != variable.orignalValue.value.Z)
                {
                    variable.realValue = variable.orignalValue.value.Z;
                    variable.value = variable.realValue.toString();
                }
                break;
            case JdwpType.JT_STRING:
                if (undefined != variable.orignalValue.value.s)
                {
                    variable.realValue = variable.orignalValue.value.s;
                    variable.value = "string@0x" + variable.realValue.toString(16);
                    variable.referenceId = variable.id;
                }
                break;
            case JdwpType.JT_THREAD:
                if (undefined != variable.orignalValue.value.t)
                {
                    variable.realValue = variable.orignalValue.value.t;
                    variable.value = "thread@0x" + variable.realValue.toString(16);
                }
                break;
            case JdwpType.JT_THREAD_GROUP:
                if (undefined != variable.orignalValue.value.g)
                {
                    variable.realValue = variable.orignalValue.value.g;
                    variable.value = "group@0x" + variable.realValue.toString(16);
                }
                break;
            case JdwpType.JT_CLASS_LOADER:
                if (undefined != variable.orignalValue.value.l)
                {
                    variable.realValue = variable.orignalValue.value.l;
                    variable.value = "classloader@0x" + variable.realValue.toString(16);
                }
                break;
            case JdwpType.JT_CLASS_OBJECT:
                if (undefined != variable.orignalValue.value.c)
                {
                    variable.realValue = variable.orignalValue.value.c;
                    variable.value = "classobject@0x" + variable.realValue.toString(16);
                }
                break;
            default:
                break;
        }
    }
}
