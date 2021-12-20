import * as fs from 'fs';
import { DexInsnType } from './enums';
import { SmaliLineInfo, SmaliLocalReg } from './interfaces_classes';
import { logError } from './utils';

const CLASS_LOOKUP_MAX_LINES : number = 10;

interface DexInsnInfo
{
    OpType : DexInsnType;
    size : number;
    defReg : string;
    refReg : string;
    refType : string;
}

interface SmaliReg
{
    slot : number;
    start : number;
    end : number;
    refType : string;
    name : string;
    isRefReg : boolean;
    isArrayItem? : boolean;
}

enum RegionLoopFlag
{
    RLF_UNPARSE,
    RLF_LOOP,
    RLF_UNLOOP,
}

interface MethodDebugInfo
{
    start : number;
    end : number;
    name : string;
    parsed : boolean;
    offsets : number[];
    isStatic : boolean;
    localVars : SmaliReg[];
}

class ClsDebugInfo
{
    public clsName : string;
    public clsUri : string;
    public methods : MethodDebugInfo[];

    constructor(cls : string)
    {
        this.clsUri = cls;
        this.clsName = cls;
        this.methods = [];
    }

    public addMethod(mth : MethodDebugInfo) : void
    {
        for (let i = 0; i < this.methods.length; i++)
        {
            if (this.methods[i].name == mth.name)
            {
                this.methods[i] = mth;
                return ;
            }
        }

        this.methods.push(mth);
    }

    public getMethod(name : string) : MethodDebugInfo | undefined
    {
        for (let i = 0; i < this.methods.length; i++)
        {
            if (this.methods[i].name == name)
            {
                return this.methods[i];
            }
        }

        return undefined;
    }

    public getLineInfoByLine(line : number) : SmaliLineInfo | undefined
    {
        let name : string = "";
        let offset : number = 0;

        for (let i = 0; i < this.methods.length; i++)
        {
            let mth = this.methods[i];
            let line_0 = line - 1;
            if (mth.start == line_0)
            {
                name = mth.name;
                offset = -1;//method entry event
                break;
            }
            else if (mth.end == line_0)
            {
                name = mth.name;
                offset = -2;//method exit event
                break;
            }
            else if (line_0 > mth.start && line_0 < mth.end)
            {
                name = mth.name;
                offset = mth.offsets[line_0 - mth.start - 1];
                break;
            }
        }

        if ("" != name)
        {
            return {
                "cls" : this.clsName,
                "mth" : name,
                "line" : line,
                "offset" : BigInt(offset),
            };
        }

        return undefined;
    }
}

class Region
{
    public name : string;
    public aliasName : string;
    public start : number;
    public end : number;
    public done : boolean;
    public regs : SmaliReg[];
    public loopRetIndexs : number[];
    public nextIndexs : number[];
    public prevIndexs : number[];
    public loop : RegionLoopFlag;

    public unParsedRegs : SmaliReg[];
    public inRegs : SmaliReg[][];
    public outRegs : SmaliReg[]; 
    public next : string[];

    constructor(name : string, start : number)
    {
        this.name = name;
        this.aliasName = name;
        this.start = start;
        this.end = start;
        this.unParsedRegs = [];
        this.next = [];
        this.regs = [];
        this.done = false;
        this.nextIndexs = [];
        this.prevIndexs = [];
        this.loopRetIndexs = [];
        this.loop = RegionLoopFlag.RLF_UNPARSE;
        this.inRegs = [];
        this.outRegs = [];
    }

    public addNext(next : string) : void
    {
        for (let i = 0; i < this.next.length; i++)
        {
            if (this.next[i] == next)
            {
                return;
            }
        }

        this.next.push(next);
    }

    public addSmaliReg(reg : SmaliReg, preAddr : number) : void
    {
        for (let i = 0; i < this.outRegs.length; i++)
        {
            if (reg.slot == this.outRegs[i].slot)
            {
                if (reg.refType != this.outRegs[i].refType)
                {
                    this.outRegs[i].end = preAddr;
                    this.regs.push(this.outRegs[i]);
                    this.outRegs[i]= reg;
                    if (reg.isRefReg)
                    {
                        this.unParsedRegs.push(reg);
                    }
                }

                return;
            }
        }

        if (reg.isRefReg) {
            this.unParsedRegs.push(reg);
        }
        this.outRegs.push(reg);
    }

    public updateParamSlot(baseSlot : number) : void
    {
        for (let i = 0; i < this.outRegs.length; i++)
        {
            this.outRegs[i].slot += baseSlot;
        }
    }

    public getSmaliReg(slot : number) : SmaliReg | undefined
    {
        for (let i = 0; i < this.outRegs.length; i++)
        {
            if (slot == this.outRegs[i].slot)
            {
                return this.outRegs[i];
            }
        }

        return undefined;
    }

    public close(offset : number) : void
    {
        this.end = offset;
        for (let i = 0; i < this.outRegs.length; i++) {
            this.outRegs[i].end = offset;
            this.regs.push(this.outRegs[i]);
        }
    }

    public parseUnknownRegs(inRegs : SmaliReg[]) : void
    {
        for (let i = 0; i < this.unParsedRegs.length; i++)
        {
            for (let j = 0; j < inRegs.length; j++)
            {
                if (this.unParsedRegs[i].refType == inRegs[j].name)
                {
                    this.unParsedRegs[i].refType = inRegs[j].refType;
                    if (this.unParsedRegs[i].isArrayItem)
                    {
                        this.unParsedRegs[i].refType = this.unParsedRegs[i].refType.slice(1);
                    }
                    break;
                }
            }
        }
    }

    public mergeRegs(inRegs : SmaliReg[]) : void 
    {
        for (let i = 0; i < inRegs.length; i++)
        {
            let j = 0;
            for (; j < this.regs.length; j++)
            {
                if (inRegs[i].slot == this.regs[j].slot)
                {
                    if (inRegs[i].refType == this.regs[j].refType)
                    {
                        //extend it's region
                        this.regs[j].start = this.start;
                    }
                    else{
                        let newReg : SmaliReg = {
                            "name" : inRegs[i].name,
                            "slot" : inRegs[i].slot,
                            "start" : this.start,
                            "end" : this.regs[j].start - 1,
                            "refType" : inRegs[i].refType,
                            "isRefReg" : false,
                        };
                        this.regs.push(newReg);//add the inherit reg
                    }

                    break;
                }
            }

            if (j == this.regs.length) {
                let newReg : SmaliReg = {
                    "name" : inRegs[i].name,
                    "slot" : inRegs[i].slot,
                    "start" : this.start,
                    "end" : this.end,
                    "refType" : inRegs[i].refType,
                    "isRefReg" : false,
                };
                this.regs.push(newReg);
                this.outRegs.push(newReg);
            }
        }
    }
}

export class SmaliParser
{
    protected debugInfos : {[key : string] : ClsDebugInfo};//uri:debuginfo
    protected fileContent : {[key : string] : string};//uri:txtcontent
    protected fileLines : {[key : string] : string[]};//uri:lines
    protected curFiles : string[];
    protected localFirst : boolean;

    constructor()
    {
        this.debugInfos = {};
        this.fileContent = {};
        this.fileLines = {};
        this.curFiles = [];
        this.localFirst = true;
    }

    public setLocalFirst(flag : boolean) : void
    {
        this.localFirst = flag;
    }

    public getLocalRegs(uri : string, mthName : string, offset : number) : SmaliLocalReg[] | undefined
    {
        let mth : MethodDebugInfo | undefined = this.parseSmaliMethod(uri, mthName);
        if (!mth)
        {
            return undefined;
        }

        let regs : SmaliLocalReg[] = [];
        let slots : number[] = [];
        for (let i = 0; i < mth.localVars.length; i++) {
            let scopevar : SmaliReg = mth.localVars[i];
            if (-1 != slots.indexOf(scopevar.slot)) {
                continue;
            }

            if (scopevar.start <= offset && offset <= scopevar.end) {
                slots.push(scopevar.slot);
                regs.push({
                    "name" : scopevar.name,
                    "slot" : scopevar.slot,
                    "type" : scopevar.refType,
                });
            }
        }

        return regs;
    }

    public getLineInfoByLine(uri : string, line : number) : SmaliLineInfo | undefined
    {
        if (line <= 2)
        {
            return undefined;
        }

        let clsInfo : ClsDebugInfo | undefined = this.debugInfos[uri];
        if (clsInfo)
        {
            let lineInfo : SmaliLineInfo | undefined = clsInfo.getLineInfoByLine(line);
            if (lineInfo)
            {
                return lineInfo;
            }
        }
        else
        {
            clsInfo = this.debugInfos[uri] = new ClsDebugInfo(uri);
        }

        let lines : string[] | undefined = this.loadSourceLines(uri);
        if (!lines || lines.length < line || lines.length < 2)
        {
            logError("getLineInfoByLine", `unexcept line ${line} in file ${uri}`);
            return undefined;
        }

        //get class name 
        let clsName : string | undefined = this.getClsName(lines);
        if (clsName)
        {
            clsInfo.clsName = clsName;
        }

        //get offset
        let start : number = 0;
        let end : number = 0;
        let offset : number = 0;
        let mthName : string = "";
        let allPos : number[] = [];
        let isStatic : boolean = false;

        //look back 
        for (let i = line - 2; i > 0; i--)
        {
            allPos.push(offset);
            const m = lines[i].match(/^\s*.method\s+[a-zA-Z\s]+\b(<?[a-zA-Z0-9_]+>?)(\([^\s]+)#?.*?\s*/);
            if (m)
            {
                mthName = m[1] + m[2];
                isStatic = -1 != m[0].slice(0, m[0].indexOf(mthName)).indexOf("static");
                start = i;
                break;
            }

            offset += this.getInsnSize(lines[i]);
        }

        //get real offset
        for (let i = 0; i < allPos.length; i++)
        {
            allPos[i] = offset - allPos[i];
        }

        allPos = allPos.reverse();

        //look ahead
        for (let i = line - 1; i < lines.length - 1; i++)
        {
            if (/^\s*.end method\s*/.test(lines[i]))
            {
                allPos.pop();
                end = i;
                break;
            }

            offset += this.getInsnSize(lines[i]);
            allPos.push(offset);
        }

        clsInfo.methods.push({
            "start" : start,
            "end" : end,
            "name" : mthName,
            "isStatic" : isStatic,
            "offsets" : allPos,
            "localVars" : [],
            "parsed" : false,
        });

        return {
            "cls" : clsInfo.clsName,
            "mth" : mthName,
            "line" : line,
            "offset" : BigInt(allPos[line - 1 - start - 1]),
        };
    }

    public getLineInfoByOffset(uri : string, mthName : string, offset : bigint) : SmaliLineInfo | undefined
    {
        let mth : MethodDebugInfo | undefined = this.parseSmaliMethod(uri, mthName);
        let index : number = Number(offset);
        if (mth)
        {
            let line: number = 0;
            for (let i = 0; i < mth.offsets.length; i++) {
                if (index == mth.offsets[i]) {
                    line = i + 1;
                }
                else if (index < mth.offsets[i]) {
                    break;
                }
            }

            return {
                "cls" : '',
                "mth" : mthName,
                "line" : line + mth.start + 1,
                "offset" : offset,
            };
        }

        return undefined;
    }

    private parseSmaliMethod(uri : string, name : string) : MethodDebugInfo | undefined
    {
        let clsInfo : ClsDebugInfo | undefined = this.debugInfos[uri];
        if (!clsInfo)
        {
            this.debugInfos[uri] = clsInfo = new ClsDebugInfo(uri);
        }

        let mth : MethodDebugInfo | undefined = clsInfo.getMethod(name);
        if (mth && mth.parsed)
        {
            return mth;
        }

        let lines : string[] | undefined = this.loadSourceLines(uri);
        if (lines) {
            //get the target method start pos
            for (let i = 0; !mth && i < lines.length; i++) {
                if (clsInfo.clsName == clsInfo.clsUri)
                {
                    if (/^\s*\.class\s+.+\s*/.test(lines[i]))
                    {
                        const m = lines[i].match(/^\s*\.class\s+([a-z\s]+)?\b(L[a-zA-Z0-9\/$_]+;)\s*/);
                        if (m)
                        {
                            clsInfo.clsName = m[2];
                        }
                        continue;
                    }
                }

                if (/^\s*\.method\s+[a-zA-Z\(\);\s]+/.test(lines[i])) {
                    const m = lines[i].match(/^\s*\.method\s+([a-zA-Z\s]+)\s(\<?[a-zA-Z_0-9]+\>?)\(([0-9a-zA-Z;$_\/\[]*)\)([^\s]+)\s*/);
                    if (m)
                    {
                        let isStatic : boolean = -1 != m[1].indexOf("static");
                        let mthName = m[2] + "(" + m[3] + ")" + m[4];
                        let tmp : MethodDebugInfo = {
                            "start": i,
                            "end": 0,
                            "name": mthName,
                            "isStatic": isStatic,
                            "offsets": [],
                            "localVars": [],
                            "parsed": false,
                        };
                        clsInfo.addMethod(tmp);
                        if (name == mthName)
                        {
                            mth = tmp;
                            break;
                        }                        
                    }
                }
            }

            //if found
            if (mth)
            {
                let regsStart: number = 0;
                let region: Region = new Region("start", 0);
                let offset: number = 0;
                let allBlocks: Region[] = [];
                let retType: string = "I";
                let switch_Name: string[] = [];
                let swtich_data: string[][] = [];

                //parse parameters
                if (!mth.isStatic) {
                    region.addSmaliReg({
                        "name" : 'p0',
                        "slot" : 0,
                        "start" : 0,
                        "end" : 0,
                        "refType" : clsInfo.clsName,
                        "isRefReg" : false,
                    }, 0);
                    regsStart++;
                }

                let params: string = mth.name.slice(mth.name.indexOf('(') + 1);
                params = params.slice(0, params.indexOf(')'));
                let prex: string = "p";
                let last: string = '';
                for (let j = 0; j < params.length; j++) {
                    if (params[j] == 'I' || params[j] == 'F' || params[j] == 'Z' ||
                        params[j] == 'B' || params[j] == 'C' || params[j] == 'S') {
                        let reg: string = prex + regsStart.toString();
                        let type: string = last + params[j];
                        last = '';
                        region.addSmaliReg({
                            "name" : reg,
                            "slot" : regsStart,
                            "start" : 0,
                            "end" : 0,
                            "refType" : type,
                            "isRefReg": false,
                        }, 0);
                        regsStart++;
                    }
                    else if (params[j] == 'D' || params[j] == 'J') {
                        let reg: string = prex + regsStart.toString();
                        let type: string = last + params[j];
                        last = '';
                        region.addSmaliReg({
                            "name" : reg,
                            "slot" : regsStart,
                            "start" : 0,
                            "end" : 0,
                            "refType" : type,
                            "isRefReg": false,
                        }, 0);
                        regsStart += 2;
                    }
                    else if (params[j] == 'L') {
                        let reg: string = prex + regsStart.toString();
                        let pos: number = params.indexOf(';', j);
                        let type: string = last + params.slice(j, pos + 1);
                        j = pos;
                        last = '';
                        region.addSmaliReg({
                            "name" : reg,
                            "slot" : regsStart,
                            "start" : 0,
                            "end" : 0,
                            "refType" : type,
                            "isRefReg": false,
                        }, 0);
                        regsStart++;
                    }
                    else {
                        last += params[j];
                    }
                }

                //parse instructions
                let lastOpcode : DexInsnType = DexInsnType.DIT_NOP;
                let updateParams : boolean = false;
                for (let i = mth.start + 1; i < lines.length - 1; i++)
                {
                    if (/^\s*.end method\s*/.test(lines[i])) {
                        mth.end = i;
                        break;
                    }

                    mth.offsets.push(offset);
                    let insnInfo: DexInsnInfo = this.getDexInsnInfo(lines[i]);
                    switch (insnInfo.OpType) {
                        case DexInsnType.DIT_MOVE:
                        case DexInsnType.DIT_AGET:
                            let refReg : SmaliReg | undefined = region.getSmaliReg(
                                this.getSlotByName(insnInfo.refReg, regsStart));

                            let newReg : SmaliReg = {
                                "name" : insnInfo.defReg,
                                "slot" : this.getSlotByName(insnInfo.defReg, regsStart),
                                "start" : offset + insnInfo.size,
                                "end" : 0,
                                "refType" : refReg?refReg.refType:insnInfo.refReg,
                                "isRefReg" : refReg?false:true,
                                "isArrayItem" : insnInfo.OpType == DexInsnType.DIT_AGET,
                            };
                            
                            region.addSmaliReg(newReg, offset);
                            break;
                        case DexInsnType.DIT_MOVE_RESULT:
                            region.addSmaliReg({
                                "name" : insnInfo.defReg,
                                "slot" : this.getSlotByName(insnInfo.defReg, regsStart),
                                "start" : offset + insnInfo.size,
                                "end" : 0,
                                "refType" : retType,
                                "isRefReg" : false,
                            }, offset);
                            break;
                        case DexInsnType.DIT_INVOKE:
                        case DexInsnType.DIT_FILL_NEW_ARRAY:
                            retType = insnInfo.refType;
                            break;
                        case DexInsnType.DIT_CONST:
                        case DexInsnType.DIT_CMP:
                        case DexInsnType.DIT_NEW_ARRAY:
                        case DexInsnType.DIT_NEW_INSTANCE:
                        case DexInsnType.DIT_CHECK_CAST:
                        case DexInsnType.DIT_NUMBER_CAST:
                        case DexInsnType.DIT_AOP:
                        case DexInsnType.DIT_IGET:
                        case DexInsnType.DIT_SGET:
                        case DexInsnType.DIT_ARRAY_LENGTH:
                            region.addSmaliReg({
                                "name" : insnInfo.defReg,
                                "slot" : this.getSlotByName(insnInfo.defReg, regsStart),
                                "start" : offset + insnInfo.size,
                                "end" : 0,
                                "refType" : insnInfo.refType,
                                "isRefReg" : false,
                            }, offset);
                            break;
                        case DexInsnType.DIT_GOTO:
                        case DexInsnType.DIT_IF:
                        case DexInsnType.DIT_SWITCH:
                            if (insnInfo.refType != region.name)
                            {
                                region.addNext(insnInfo.refType);
                            }

                            region.close(offset + insnInfo.size);
                            allBlocks.push(region);

                            if (insnInfo.OpType == DexInsnType.DIT_IF) {
                                let tmpStart : number = offset + insnInfo.size;
                                let name = "IF_" + tmpStart.toString();
                                region.addNext(name);
                                region = new Region(name, tmpStart);
                            }
                            break;
                        case DexInsnType.DIT_MACOR_LABEL:
                            /**
                             * if xx lable2
                             * :label1
                             * xx
                             * :label2
                             */
                            if (lastOpcode == DexInsnType.DIT_IF)
                            {
                                region.aliasName = insnInfo.refType;
                                break;
                            }
                            else if (lastOpcode != DexInsnType.DIT_GOTO && 
                                lastOpcode != DexInsnType.DIT_SWITCH)
                            {
                                if (lastOpcode != DexInsnType.DIT_RETURN && 
                                    lastOpcode != DexInsnType.DIT_THROW)
                                {
                                    region.addNext(insnInfo.refType);
                                }

                                region.close(offset);
                                allBlocks.push(region);
                            }

                            region = new Region(insnInfo.refType, offset);
                            break;
                        case DexInsnType.DIT_MACOR_REGISTER:
                            if (!updateParams)
                            {
                                if (this.localFirst)
                                {
                                    regsStart = parseInt(insnInfo.refType) - regsStart;
                                    region.updateParamSlot(regsStart);
                                }

                                updateParams = true;
                            }

                            break;
                        case DexInsnType.DIT_MACOR_LOCALS:
                            if (!updateParams) {
                                if (this.localFirst)
                                {
                                    regsStart = parseInt(insnInfo.refType);
                                    region.updateParamSlot(regsStart);
                                }

                                updateParams = true;
                            }
                            break;
                        case DexInsnType.DIT_MACOR_SPARSE_SWITCH_START:
                        case DexInsnType.DIT_MACOR_PACKED_SWITCH_START:
                            switch_Name.push(region.name);
                            let data : string[] = [];
                            for (; i < lines.length - 2; ) {
                                const txt: string = lines[++i];
                                if (/^\s*(\.end\s+sparse-switch|\.end\s+packed-switch)\s*/.test(txt)) {
                                    break;
                                }

                                let name: string = txt.slice(txt.indexOf(":"));
                                name = name.slice(0, name.search(/\s/));
                                //add the name
                                data.push(name);
                            }

                            swtich_data.push(data);
                            break;
                        default:
                            break;
                    }

                    offset += insnInfo.size;
                    lastOpcode = insnInfo.OpType != DexInsnType.DIT_NONE?insnInfo.OpType:lastOpcode;
                }

                region.close(offset);
                if (lastOpcode != DexInsnType.DIT_GOTO &&
                    lastOpcode != DexInsnType.DIT_SWITCH) {
                    allBlocks.push(region);
                }

                //set the alias name
                for (let i = 0; i < switch_Name.length; i++) {
                    let data = swtich_data[i];
                    for (let j = 0; j < data.length; j++) {
                        for (let k = 0; k < allBlocks.length; k++) {
                            if (data[j] == allBlocks[k].name) {
                                allBlocks[k].aliasName = switch_Name[i];
                                break;
                            }
                        }
                    }
                }

                //trasvel the blocks & get var scope list
                mth.localVars = this.analysisScope(allBlocks);
                mth.parsed = true;

                return mth;
            }
        }

        return undefined;
    }

    private parseExecutePaths(blocks : Region[]) : void
    {
        for (let i = 0; i < blocks.length; i++)
        {
            for (let j = 0; j < blocks[i].next.length; j++)
            {
                for (let k = 0; k < blocks.length; k++)
                {
                    if (blocks[k].aliasName == blocks[i].next[j] || blocks[k].name == blocks[i].next[j])
                    {
                        blocks[i].nextIndexs.push(k);
                        blocks[k].prevIndexs.push(i);
                    }
                }
            }
        }
    }

    private intersection(a : SmaliReg[], b : SmaliReg[]) : SmaliReg[]{
        let res : SmaliReg[] = [];

        for (let i = 0; i < a.length; i++)
        {
            for (let j = 0; j < b.length; j++)
            {
                if (a[i].slot == b[j].slot && a[i].refType == b[j].refType)
                {
                    res.push({
                        "name" : a[i].name,
                        "slot" : a[i].slot,
                        "start" : a[i].start,
                        "end" : a[i].end,
                        "refType" : a[i].refType,
                        "isRefReg" : a[i].isRefReg,
                    });
                }
            }
        }

        return res;
    }

    private exclusive(a : SmaliReg[], b : SmaliReg[]) : void{
        for (let i = 0; i < a.length; i++)
        {
            for (let j = 0; j < b.length; j++)
            {
                if (a[i].slot == b[j].slot && a[i].refType != b[j].refType)
                {
                    a.splice(i, 1);
                    i--;
                    break;
                }
            }
        }
    }

    private isArrival(blocks : Region[], start : number, stop : number, level : number = 0) : boolean
    {
        if (RegionLoopFlag.RLF_UNPARSE != blocks[start].loop)
        {
            return blocks[start].loop == RegionLoopFlag.RLF_LOOP;
        }

        if (level > blocks.length)
        {
            return false;
        }

        let res : boolean = false;
        do
        {
            if (-1 != blocks[start].nextIndexs.indexOf(stop))
            {
                if (start != stop)
                {
                    blocks[stop].loopRetIndexs.push(start);
                    blocks[stop].prevIndexs.splice(blocks[stop].prevIndexs.indexOf(start), 1);
                }
                res = true;
                break;
            }

            for (let i = 0; i < blocks[start].nextIndexs.length; i++)
            {
                res = this.isArrival(blocks, blocks[start].nextIndexs[i], stop, level + 1);
                if (res)
                {
                    break;
                }
            }
        }while(0)

        blocks[start].loop = res?1:2;
        return res;
    }

    private traverse(blocks: Region[], start: number, stop: number, level : number = 0): Region[] {
        if (start == stop || level > blocks.length)
        {
            return [];
        }

        let paths : Region[] = [];
        let block = blocks[start];
        if (this.isArrival(blocks, start, stop))
        {
            paths.push(block);
            for (let i = 0; i < block.nextIndexs.length; i++)
            {
                paths = paths.concat(this.traverse(blocks, block.nextIndexs[i], stop, level + 1));
            }
        }

        return paths;
    }

    private getLoopPathDefRegs(blocks : Region[], index : number) : SmaliReg[]
    {
        let regs : SmaliReg[] = [];

        regs = regs.concat(blocks[index].outRegs);
        for (let i = 0; i < blocks[index].loopRetIndexs.length; i++)
        {
            let blks : Region[] = this.traverse(blocks, index, blocks[index].loopRetIndexs[i]);
            blks = blks.concat(blocks[blocks[index].loopRetIndexs[i]]);
            for (let j = 0; j < blks.length; j++)
            {
                regs = regs.concat(blks[j].outRegs);
            }
        }

        return regs;
    }

    private analysisScope(blocks : Region[]) : SmaliReg[]
    {
        let regs : SmaliReg[] = [];
        if (0 == blocks.length)
        {
            return regs;
        }

        this.parseExecutePaths(blocks);
        if ("start" != blocks[0].aliasName)
        {
            return regs;
        }

        //copy the first region directly
        let block : Region | undefined = blocks[0];
        block.done = true;
        regs = regs.concat(block.regs);

        let unParsed : Region[] = [];
        for (;block; block = unParsed.shift())
        {
            for (let i = 0; i < block.nextIndexs.length; i++)
            {
                let nextBlock: Region = blocks[block.nextIndexs[i]];
                //if this block has been processed the skip it
                if (nextBlock.done)
                {
                    continue;
                }

                if (1 >= nextBlock.prevIndexs.length)//jump from the block, cannot be 0
                {
                    nextBlock.parseUnknownRegs(block.outRegs);
                    nextBlock.mergeRegs(block.outRegs);
                    nextBlock.done = true;
                    regs = regs.concat(nextBlock.regs);
                    //do next
                    unParsed.push(nextBlock);
                }
                else if (this.isArrival(blocks, block.nextIndexs[i], block.nextIndexs[i]))
                {
                    //process the regions on the loop path
                    //if all dependent regions has been processed,then get it's regs, 
                    //else just push the input regs
                    if (nextBlock.prevIndexs.length - 1 != nextBlock.inRegs.length)
                    {
                        nextBlock.inRegs.push(block.outRegs);
                    }
                    else
                    {
                        //get the inherit regs
                        let inheritRegs : SmaliReg[] = block.outRegs.concat([]);
                        for (let j = 0; j < nextBlock.inRegs.length; j++)
                        {
                            inheritRegs = this.intersection(inheritRegs, nextBlock.inRegs[j]);
                        }

                        //excluse the loop path define regs
                        this.exclusive(inheritRegs, this.getLoopPathDefRegs(blocks, block.nextIndexs[i]));

                        nextBlock.parseUnknownRegs(inheritRegs);
                        nextBlock.mergeRegs(inheritRegs);
                        nextBlock.done = true;
                        regs = regs.concat(nextBlock.regs);
                        unParsed.push(nextBlock);
                    }
                }
                else
                {
                    //process the unloop-path's regions
                    if (nextBlock.prevIndexs.length - 1 == nextBlock.inRegs.length)
                    {
                        //get all upregion's regs intersection
                        let inheritRegs : SmaliReg[] = block.outRegs;
                        for (let j = 0; j < nextBlock.inRegs.length; j++)
                        {
                            inheritRegs = this.intersection(inheritRegs, nextBlock.inRegs[j]);
                        }
                        
                        nextBlock.parseUnknownRegs(inheritRegs);
                        nextBlock.mergeRegs(inheritRegs);
                        nextBlock.done = true;
                        regs = regs.concat(nextBlock.regs);
                        //do next
                        unParsed.push(nextBlock);
                        continue;
                    }

                    //add the inregs
                    nextBlock.inRegs.push(block.outRegs);
                }
            }
        }

        return regs;
    }

    private getInsnSize(insn : string) : number
    {
        if ('' == insn)
        {
            return 0;
        }

        let insn1Size : RegExp = new RegExp('^\\s*(nop|' + //nop
                                            'move|move-wide|move-object|move-result|' + //mov
                                            'move-result-wide|move-result-object|move-exception|' +  //mov
                                            'return-void|return|return-wide|return-object|' +  //return 
                                            'const\\/4|' +  //const
                                            'monitor-enter|monitor-exit|' +  //monitor
                                            'array-length|' +  //array length
                                            'throw|' +  //throw
                                            'goto|' +  //jump
                                            'neg-int|not-int|neg-long|not-long|neg-float|neg-double|' + //AOP
                                            'int-to-long|int-to-float|int-to-double|long-to-int|' + //cast
                                            'long-to-float|long-to-double|float-to-int|float-to-long|' + //cast
                                            'float-to-double|double-to-int|double-to-long|' + //cast
                                            'double-to-float|int-to-byte|int-to-char|int-to-short|' + //cast
                                            'add-int\\/2addr|sub-int\\/2addr|mul-int\\/2addr|' + //addr
                                            'div-int\\/2addr|rem-int\\/2addr|and-int\\/2addr|' + //addr
                                            'or-int\\/2addr|xor-int\\/2addr|shl-int\\/2addr|' + //addr
                                            'shr-int\\/2addr|ushr-int\\/2addr|add-long\\/2addr|' + //addr
                                            'sub-long\\/2addr|mul-long\\/2addr|div-long\\/2addr|' + //addr
                                            'rem-long\\/2addr|and-long\\/2addr|or-long\\/2addr|' + //addr
                                            'xor-long\\/2addr|shl-long\\/2addr|shr-long/2addr|' + //addr
                                            'ushr-long\\/2addr|add-float\\/2addr|sub-float\\/2addr|' + //addr
                                            'mul-float\\/2addr|div-float\\/2addr|rem-float\\/2addr|' + //addr
                                            'add-double\\/2addr|sub-double\\/2addr|mul-double\\/2addr|' + //addr
                                            'div-double\\/2addr|rem-double\\/2addr|' + //addr
                                            '\\+return-void-barrier)' + //
                                            '\\b.*', 'g');

        let insn2Size: RegExp = new RegExp('^\\s*(move\\/from16|move-wide\\/from16|move-object\\/from16|' + //mov
                                           'const\\/16|const-wide\\/high16|const-string|const-class|' +  //const
                                           'check-cast|' +  //check-cast
                                           'instance-of|' +  //instance-of
                                           'new-instance|' +  //new-instance
                                           'new-array|' +  //new-array
                                           'goto\\/16|' + //jump
                                           'cmpl-float|cmpg-float|cmpl-double|cmpg-double|cmp-long|' + //cmp
                                           'if-eq|if-ne|if-lt|if-ge|if-gt|if-le|' + //if
                                           'if-eqz|if-nez|if-ltz|if-gez|if-gtz|if-lez|' + //if
                                           'aget|aget-wide|aget-object|aget-boolean|aget-byte|aget-char|aget-short|' + //aget
                                           'aput|aput-wide|aput-object|aput-boolean|aput-byte|aput-char|aput-short|' + //aput
                                           'iget|iget-wide|iget-object|iget-boolean|iget-byte|iget-char|iget-short|' + //iget
                                           'iput|iput-wide|iput-object|iput-boolean|iput-byte|iput-char|iput-short|' + //iput
                                           'sget|sget-wide|sget-object|sget-boolean|sget-byte|sget-char|sget-short|' + //sget
                                           'sput|sput-wide|sput-object|sput-boolean|sput-byte|sput-char|sput-short|' + //sput
                                           'add-int|sub-int|mul-int|div-int|rem-int|and-int|or-int|' + //AOP
                                           'xor-int|shl-int|shr-int|ushr-int|add-long|sub-long|' + //AOP
                                           'mul-long|div-long|rem-long|and-long|or-long|xor-long|' + //AOP
                                           'shl-long|shr-long|ushr-long|add-float|sub-float|mul-float|' + //AOP
                                           'div-float|rem-float|add-double|sub-double|mul-double|' + //AOP
                                           'div-double|rem-double|rsub-int|' + //AOP
                                           'add-int\\/lit16|mul-int\\/lit16|div-int\\/lit16|' + //lit AOP
                                           'rem-int\\/lit16|and-int\\/lit16|or-int\\/lit16|' + //lit AOP
                                           'xor-int\\/lit16|add-int\\/lit8|rsub-int\\/lit8|' + //lit AOP
                                           'mul-int\\/lit8|div-int\\/lit8|rem-int\\/lit8|' + //lit AOP
                                           'and-int\\/lit8|or-int\\/lit8|xor-int\\/lit8|' + //lit AOP
                                           'shl-int\\/lit8|shr-int\\/lit8|ushr-int/lit8|' + //lit AOP
                                           '\\+iget-volatile|\\+iget-object-volatile|\\+iget-wide-volatile|' + //+iget
                                           '\\+iput-volatile|\\+iput-object-volatile|\\+iput-wide-volatile|' + //+iput
                                           '\\+sget-volatile|\\+sget-object-volatile|\\+sget-wide-volatile|' + //+sget
                                           '\\+sput-volatile|\\+sput-object-volatile|\\+sput-wide-volatile|' + //+sput
                                           '\\^throw-verification-error|' + //throw
                                           '\\+iget-quick|\\+iget-wide-quick|\\+iget-object-quick|' + //iget quick
                                           '\\+iput-quick|\\+iput-wide-quick|\\+iput-object-quick)' + //iput quic
                                           '\\b.*', 'g');
        
        let insn3Size: RegExp = new RegExp('^\\s*(move\\/16|move-wide\\/16|move-object\\/16|' +  //mov
                                           'const|const-wide\\/32|const-string\\/jumbo|' + //const
                                           'filled-new-array|filled-new-array/range|fill-array-data|' + //fill
                                           'goto\\/32|' + //jmp
                                           'packed-switch|sparse-switch|' + //switch
                                           'invoke-virtual|invoke-super|invoke-direct|invoke-static|' + //invoke
                                           'invoke-interface|invoke-virtual\\/range|invoke-super\\/range|' + //invoke
                                           'invoke-direct\\/range|invoke-static\\/range|invoke-interface\\/range|' + //invoke
                                           '\\+invoke-object-init\\/range|\\+invoke-virtual-quick|' + //+inovke
                                           '\\+invoke-virtual-quick/\\range|\\+invoke-super-quick|' + //+inovke
                                           '\\+invoke-super-quick/\\range|' + //+inovke
                                           '\\+execute-inline|\\+execute-inline\\/range)' + //+execute
                                           '\\b.*', 'g');

        let insn5Size: RegExp = new RegExp('^\\s*const-wide\\b.*', 'g');

        if (insn1Size.test(insn))
        {
            return 1;
        }
        else if (insn2Size.test(insn))
        {
            return 2;
        }
        else if (insn3Size.test(insn))
        {
            return 3;
        }
        else if (insn5Size.test(insn))
        {
            return 5;
        }

        return 0;
    }

    private getDexInsnInfo(insn : string) : DexInsnInfo
    {
        if ('' == insn)
        {
            return {
                "OpType" : DexInsnType.DIT_NONE,
                "defReg" : '',
                "refReg" : '',
                "refType" : '',
                "size" : 0,
            }
        }
        //move
        let m = insn.match(/^\s+(mov|move-wide|move-object)\s+([vp0-9]+),\s+([vp0-9]+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_MOVE,
                "defReg" : m[2],
                "refReg" : m[3],
                "refType" : '',
                "size" : 1,
            };
        }

        m = insn.match(/^\s+(move\/from16|move-wide\/from16|move-object\/from16)\s+([vp0-9]+),\s+([vp0-9]+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_MOVE,
                "defReg" : m[2],
                "refReg" : m[3],
                "refType" : '',
                "size" : 2,
            };
        }

        m = insn.match(/^\s+(move\/16|move-wide\/16move-object\/16)\s+([vp0-9]+),\s+([vp0-9]+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_MOVE,
                "defReg" : m[2],
                "refReg" : m[3],
                "refType" : '',
                "size" : 3,
            };
        }

        m = insn.match(/^\s+(move-result|move-result-wide|move-result-object|move-exception)\s+([vp0-9]+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_MOVE_RESULT,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : '',
                "size" : 1,
            };
        }

        //return 
        m = insn.match(/^\s+(return-void|return|return-wide|return-object).*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_RETURN,
                "defReg" : '',
                "refReg" : '',
                "refType" : '',
                "size" : 1,
            };
        }

        //invoke
        m = insn.match(/^\s+(invoke-[a-z]*)\s+[0-9$_a-zA-Z;\-><\/\{\}\[,\s]+\(.*\)([0-9a-zA-Z$\/_\[]+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_INVOKE,
                "defReg" : '',
                "refReg" : '',
                "refType" : m[2],//return type
                "size" : 3,
            };
        }

        //const
        m = insn.match(/^\s+(const\/4|const\/16|const)\s+([vp0-9]+),.*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : 'I',
                "size" : m[1] == "const"?3:(m[1] == "const/16"?2:1),
            };
        }

        m = insn.match(/^\s+const\/high16\s+([vp0-9]+),.*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : 'F',
                "size" : 2,
            };
        }

        m = insn.match(/^\s+(const-wide|const-wide\/16|const-wide\/32)\s+([vp0-9]+),.*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : 'J',
                "size" : m[1] == "const-wide"?5:(m[1] == "const-wide/16"?2:3),
            };
        }

        m = insn.match(/^\s+const-wide\/high16\s+([vp0-9]+),.*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : 'D',
                "size" : 2,
            };
        }

        m = insn.match(/^\s+(const-string|const-string\/jumbo)\s+([vp0-9]+),.*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[2],
                "refReg" : '',
                "refType" : 'Ljava/lang/String;',
                "size" : m[1] == "const-string"?2:3,
            };
        }

        m = insn.match(/^\s+const-class\s+([vp0-9]+),.+\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CONST,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : 'Ljava/lang/Class;',
                "size" : 2,
            };
        }

        //monitor
        m = insn.match(/^\s+(monitor-enter|monitor-exit).*\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_MONITOR,
                "defReg" : '',
                "refReg" : '',
                "refType" : '',
                "size" : 1,
            };
        }

        //instance-of
        m = insn.match(/^\s+instance-of\s+([vp0-9]+),.+\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_INSTANCE_OF,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : 'Z',
                "size" : 2,
            };
        }

        //array-length
        m = insn.match(/^\s+array-length\s+([vp0-9]+),.+\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_ARRAY_LENGTH,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : 'I',
                "size" : 1,
            };
        }

        //new array
        m = insn.match(/^\s+new-array\s+([vp0-9]+),\s*[vp0-9]+,\s*(\[[\[La-zA-Z0-9$_]+;)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_NEW_ARRAY,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : m[2],
                "size" : 2,
            };
        }

        //new instance
        m = insn.match(/^\s+new-instance\s+([vp0-9]+),\s*(L[a-zA-Z0-9$_\/]+;)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_NEW_INSTANCE,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : m[2],
                "size" : 2,
            };
        }

        //check-cast
        m = insn.match(/^\s+check-cast\s+([vp0-9]+),\s*([\[L]]+[a-zA-Z0-9$_]+;)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_CHECK_CAST,
                "defReg" : m[1],
                "refReg" : '',
                "refType" : m[2],
                "size" : 2,
            };
        }

        //fill
        m = insn.match(/^\s+(filled-new-array|filled-new-array\/range)\s*{[vp0-9,\s]+}\s*(\[.+)\s*/);
        if (m)
        {
            return {
                "OpType" : DexInsnType.DIT_FILL_NEW_ARRAY,
                "defReg" : '',
                "refReg" : '',
                "refType" : m[2],
                "size" : 3,
            };
        }

        m = insn.match(/^\s+fill-array-data\s+.*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_FILL_ARRAY_DATA,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 3,
            };
        }

        //throw
        m = insn.match(/^\s+throw\s+.*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_THROW,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 1,
            };
        }

        //goto
        m = insn.match(/^\s+(goto|goto\/16|goto\/32)\s+(:[a-zA-Z0-9_]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_GOTO,
                "defReg": '',
                "refReg": '',
                "refType": m[2], //lable name
                "size": m[1] == "goto"?1:(m[1] == "goto/16"?2:3),
            };
        }

        //switch
        m = insn.match(/^\s+(packed-switch|sparse-switch)\s+[vp0-9]+,\s*(:[0-9a-zA-Z_]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_SWITCH,
                "defReg": '',
                "refReg": '',
                "refType": m[2], //switch name
                "size": 3,
            };
        }

        //cmp
        m = insn.match(/^\s+(cmpl-float|cmpg-float|cmpl-double|cmpg-double|cmp-long)\s+([vp0-9]+),.+\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_CMP,
                "defReg": m[2],
                "refReg": '',
                "refType": 'Z',
                "size": 2,
            };
        }

        //if
        m = insn.match(/^\s+(if-eq|if-ne|if-lt|if-ge|if-gt|if-le|if-eqz|if-nez|if-ltz|if-gez|if-gtz|if-lez)(\s+[vp0-9]+,)+\s*(:[0-9a-zA-Z_]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_IF,
                "defReg": '',
                "refReg": '',
                "refType": m[3], //label name
                "size": 2,
            };
        }

        //iget or sget
        m = insn.match(/^\s+(iget|iget-wide|iget-object|iget-boolean|iget-byte|iget-char|iget-short|sget|sget-wide|sget-object|sget-boolean|sget-byte|sget-char|sget-short)\s+([vp0-9]+),[^:]+:([L$0-9_a-zA-Z\/\[]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_IGET,
                "defReg": m[2],
                "refReg": '',
                "refType": m[3],
                "size": 2,
            };
        }

        m = insn.match(/^\s+(aget|aget-wide|aget-boolean|aget-byte|aget-char|aget-short)\s+([vp0-9]+),\s*([vp0-9]+)+.*\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_AGET,
                "defReg": m[2],
                "refReg": m[3],
                "refType": '',
                "size": 2,
            };
        }

        //put
        m = insn.match(/^\s+(aput|aput-wide|aput-object|aput-boolean|aput-byte|aput-char|aput-short|iput|iput-wide|iput-object|iput-boolean|iput-byte|iput-char|iput-short|sput|sput-wide|sput-object|sput-boolean|sput-byte|sput-char|sput-short).*\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_APUT,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 2,
            };
        }

        //aop
        m = insn.match(/^\s+(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr|rsub)-(int|long|float|double)(\/lit16|\/lit8)?\s+([vp0-9]+),\s*[vp0-9]+.+\s*/);
        if (m) {
            let type : string = 'I';
            switch (m[2]) {
                case "int":
                    type = 'I';
                    break;
                case "long":
                    type = 'J';
                    break;
                case "float":
                    type = 'F';
                    break;
                case "double":
                    type = 'D';
                    break;
                default:
                    break;
            }

            return {
                "OpType": DexInsnType.DIT_AOP,
                "defReg": m[4],
                "refReg": '',
                "refType": type,
                "size": 2,
            };
        }

        //cast int-to-byte ...
        m = insn.match(/^\s+(int|long|float|double)-to-(int|long|float|double)\s+([vp0-9]+),\s*[vp0-9]+\s*/);
        if (m) {
            let type : string = 'I';
            switch (m[2]) {
                case "int":
                    type = 'I';
                    break;
                case "long":
                    type = 'J';
                    break;
                case "float":
                    type = 'F';
                    break;
                case "double":
                    type = 'D';
                    break;
                default:
                    break;
            }
            return {
                "OpType": DexInsnType.DIT_NUMBER_CAST,
                "defReg": m[3],
                "refReg": '',
                "refType": type,
                "size": 1,
            };
        }

        //addr
        m = insn.match(/^\s+[0-9a-zA-Z]+-(int|long|float|double)\/2addr\s+.*\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_AOP_ADDR,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 1,
            };
        }

        //neg not
        m = insn.match(/^\s+(neg-int|not-int|neg-long|not-long|neg-float|neg-double)\s+.*\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_NEG_NOT,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 1,
            };
        }

        //nop
        m = insn.match(/^\snop\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_NOP,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 1,
            };
        }

        //.register
        m = insn.match(/^\s+\.registers\s+([0-9]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_REGISTER,
                "defReg": '',
                "refReg": '',
                "refType": m[1],//size
                "size": 0,
            };
        }

        //.register
        m = insn.match(/^\s+\.locals\s+([0-9]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_LOCALS,
                "defReg": '',
                "refReg": '',
                "refType": m[1],//size
                "size": 0,
            };
        }

        //label
        m = insn.match(/^\s+(:[a-zA-Z0-9_]+)\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_LABEL,
                "defReg": '',
                "refReg": '',
                "refType": m[1],//label name
                "size": 0,
            };
        }

        //.sparse-switch
        m = insn.match(/^\s+\.sparse-switch\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_SPARSE_SWITCH_START,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 0,
            };
        }

        m = insn.match(/^\s+\.end\s+sparse-switch\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_SPARSE_SWITCH_END,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 0,
            };
        }

        //.packed-switch
        m = insn.match(/^\s+\.packed-switch\s+[0-9Xxa-fA-F]+\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_PACKED_SWITCH_START,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 0,
            };
        }

        m = insn.match(/^\s+\.end\s+packed-switch\s*/);
        if (m) {
            return {
                "OpType": DexInsnType.DIT_MACOR_PACKED_SWITCH_END,
                "defReg": '',
                "refReg": '',
                "refType": '',
                "size": 0,
            };
        }

        //default
        return {
            "OpType" : DexInsnType.DIT_NONE,
            "defReg" : '',
            "refReg" : '',
            "refType" : '',
            "size" : 0,
        }
    }

    private getSlotByName(name : string, argsIndex : number) : number
    {
        let slot = 0;
        if (name[0] == 'v')
        {
            slot = parseInt(name.slice(1));
            if (!this.localFirst)
            {
                slot = argsIndex + slot;
            }
        }
        else
        {
            slot = parseInt(name.slice(1));
            if (this.localFirst)
            {
                slot = argsIndex + slot;
            }
        }

        return slot;
    }

    private getClsName(lines : string[]) : string | undefined
    {
        for (let i = 0; i < (CLASS_LOOKUP_MAX_LINES > lines.length?lines.length:CLASS_LOOKUP_MAX_LINES); i++)
        {
            //example: .class Lcom/example/testmain/MainActivity;
            const m = lines[i].match(/^\s*\.class\s+([a-z\s]+)?\b(L[a-zA-Z0-9\/$_]+;)\s*/);
            if (m)
            {
                return m[2];
            }
        }

        return undefined;
    }

    private loadSource(uri : string) : string | undefined
    {
        let contents: string | undefined = this.fileContent[uri];
        if (!contents) {
            try {
                const bytes = fs.readFileSync(uri);
                contents = Buffer.from(bytes).toString('utf8');
                this.fileContent[uri] = contents;
                this.curFiles.push(uri);

                if (this.curFiles.length > 23) {
                    const file = this.curFiles.shift();
                    if (file) {
                        delete this.fileLines[file];
                        delete this.fileContent[file];
                    }
                }
            } catch (error) {
                logError("loadSource", `load file ${uri} failed.`);
                return undefined;
            }
        }

        return contents;
    }

    private loadSourceLines(uri : string) : string[] | undefined
    {
        let lines: string[] = this.fileLines[uri];
        if (!lines) {
            let contents: string | undefined = this.loadSource(uri);
            if (contents)
            {
                lines = contents.split(/\r?\n/);
                this.fileLines[uri] = lines;
            }
        }

        return lines;
    }
}
