import { type } from "os";
import path = require("path");
import { fieldID, frameID, javaValue, methodID, objectID, referenceTypeID, threadID } from "./buffer";
import { BreakpointStatus } from "./enums";
import { JdwpType, JdwpTypeTag } from "./JDWPConstants";
import { getClassStatus, logError } from "./utils";

export interface SmaliLaunchArguments
{
    packageName? : string;
    mainActivity? : string;
    deviceId? : string;
    workDir? : string;
    trace? : 'verbose' | 'trace' | 'info' | 'log' | 'warn' | 'error';
    logFile? : string;
}

export interface DebugBreakPoint
{
    file : string;
    line : number;
    hitCount : number;
    clsName : string;
    methodName : string;
    offset : bigint;
    requestId : number;
    status : BreakpointStatus;
}

export interface JavaFrame
{
    thread : threadID;
    frameId : frameID;
    handleID : number;
    clsfile : string;
    clsName : string;
    mthName : string;
    line : number;
    offset : bigint;
}

export interface DebugVariable
{
    id : number;
    name : string;
    value : string;
    frameId : number;
    realValue : objectID | number | bigint | boolean;
    orignalValue : javaValue;
    slot? : number;
    thread? : threadID;
    size? : number; //used by array
    refTypeId : referenceTypeID; //used by class or interface object
    fieldId? : fieldID; //used by class object
    frame? : frameID;
    type : JdwpType;
    parent? : DebugVariable;
    realType? : string;
    static? : boolean;
    referenceId? : number;
    children? : DebugVariable[];
}

export interface SmaliLineInfo
{
    cls : string;
    mth : string;
    line : number;
    offset : bigint;
}

export class MethodInfo
{
    public signature : string;
    public name : string;
    public methodID : methodID;
    public modBits : number;
    public protoType : string;

    constructor(protoType : string, signature : string, name : string, methodId : methodID, modBits : number)
    {
        this.signature = signature;
        this.name = name;
        this.methodID = methodId;
        this.modBits = modBits;
        this.protoType = protoType;
    }
}

export class ClassInfo
{
    public signature : string;
    public refTypeTag : JdwpTypeTag;
    public typeID : referenceTypeID;
    public status : string;
    private methods_protoType : {[key : string]: MethodInfo};
    private methods_id : Map<methodID, MethodInfo>;
    private source : string;

    constructor(signature : string, refTypeTag : JdwpTypeTag, typeID : referenceTypeID, status : number)
    {
        this.methods_protoType = {};
        this.methods_id = new Map();
        this.signature = signature;
        this.refTypeTag = refTypeTag;
        this.typeID = typeID;
        this.status = getClassStatus(status);
        this.source = "";
    }

    public GetMethodSize() : number
    {
        return this.methods_id.size;
    }

    public getSourcePath(rootDir: string): string {
        if ("" == this.source) {
            let src: string = this.signature.slice(0);
            src = src.replace(/[\/]/g, path.sep);
            src = rootDir + src.slice(1, src.indexOf(';')) + ".smali";
            this.source = src;
        }

        return this.source;
    }

    public AddMethod(type : string, methodId : methodID, method : MethodInfo) : void
    {
        if ("" != type)
        {
            this.methods_protoType[type] = method;
        }

        this.methods_id.set(methodId, method);
    }

    public AddMethods(names : string[], signatures : string[], methodIds : methodID[], modBitses : number[]) : void
    {
        if (names.length != signatures.length ||
            names.length != methodIds.length || 
            names.length != modBitses.length) {
            logError("AddMethods", "Arrays size are different.");
            return ;
        }

        for (let i = 0; i < names.length; i++)
        {
            let type : string = names[i] + signatures[i];
            this.AddMethod(type, methodIds[i], 
                new MethodInfo(type, signatures[i], names[i], methodIds[i], modBitses[i]));
        }
    }

    public getMethodFromProtoType(type : string) : MethodInfo | undefined
    {
        return this.methods_protoType[type];
    }

    public getMethodFromMethodId(methodId : methodID) : MethodInfo | undefined
    {
        return this.methods_id.get(methodId);
    }
}

export class Handles<T> {

	private START_HANDLE = 1000;

	private _nextHandle : number;
	private _handleMap = new Map<number, T>();

	public constructor(startHandle?: number) {
		this._nextHandle = typeof startHandle === 'number' ? startHandle : this.START_HANDLE;
	}

	public reset() : void {
		this._nextHandle = this.START_HANDLE;
		this._handleMap = new Map<number, T>();
	}

	public create(value : T): number {
		var handle = this._nextHandle++;
		this._handleMap.set(handle, value);
		return handle;
	}

	public get(handle : number, dflt?: T): T | undefined {
		return this._handleMap.get(handle) || dflt;
	}

    public erase(handle : number) : void
    {
        this._handleMap.delete(handle);
    }

    public clear() : void
    {
        this._handleMap.clear();
    }
}
