import * as net from "net";
import { EventEmitter } from "events";
import { setImmediate } from 'timers';
import { PromiseCompleter } from "./utils";
import { AR_GetValuesReply, AR_GetValuesRequest, AR_LengthReply, AR_LengthRequest, AR_SetValuesRequest, AT_NewInstanceReply, AT_NewInstanceRequest, CLR_VisibleClassesReply, CLR_VisibleClassesRequest, COR_ReflectedTypeReply, COR_ReflectedTypeRequest, CT_InvokeMethodReply, CT_InvokeMethodRequest, CT_NewInstanceReply, CT_NewInstanceRequest, CT_SetValuesRequest, CT_SuperclassReply, CT_SuperclassRequest, ER_ClearRequest, ER_SetReply, ER_SetRequest, JavaEvent, JavaModifier, M_BytecodesReply, M_BytecodesRequest, M_IsObsoleteReply, M_IsObsoleteRequest, M_LineTableReply, M_LineTableRequest, M_VariableTableReply, M_VariableTableRequest, M_VariableTableWithGenericReply, M_VariableTableWithGenericRequest, OR_DisableCollectionRequest, OR_EnableCollectionRequest, OR_GetValuesReply, OR_GetValuesRequest, OR_InvokeMethodReply, OR_InvokeMethodRequest, OR_IsCollectedReply, OR_IsCollectedRequest, OR_MonitorInfoReply, OR_MonitorInfoRequest, OR_ReferenceTypeReply, OR_ReferenceTypeRequest, OR_ReferringObjectsReply, OR_ReferringObjectsRequest, OR_SetValuesRequest, RT_ClassFileVersionReply, RT_ClassFileVersionRequest, RT_ClassLoaderReply, RT_ClassLoaderRequest, RT_ClassObjectReply, RT_ClassObjectRequest, RT_ConstantPoolReply, RT_ConstantPoolRequest, RT_FieldsReply, RT_FieldsRequest, RT_FieldsWithGenericReply, RT_FieldsWithGenericRequest, RT_GetValuesReply, RT_GetValuesRequest, RT_InstancesReply, RT_InstancesRequest, RT_InterfacesReply, RT_InterfacesRequest, RT_MethodsReply, RT_MethodsRequest, RT_MethodsWithGenericReply, RT_MethodsWithGenericRequest, RT_ModifiersReply, RT_ModifiersRequest, RT_NestedTypesReply, RT_NestedTypesRequest, RT_SignatureReply, RT_SignatureRequest, RT_SignatureWithGenericReply, RT_SignatureWithGenericRequest, RT_SourceDebugExtensionReply, RT_SourceDebugExtensionRequest, RT_SourceFileReply, RT_SourceFileRequest, RT_StatusReply, RT_StatusRequest, SF_GetValuesReply, SF_GetValuesRequest, SF_PopFramesRequest, SF_SetValuesRequest, SF_ThisObjectReply, SF_ThisObjectRequest, SR_ValueReply, SR_ValueRequest, TGR_ChildrenReply, TGR_ChildrenRequest, TGR_NameReply, TGR_NameRequest, TGR_ParentReply, TGR_ParentRequest, TR_CurrentContendedMonitorReply, TR_CurrentContendedMonitorRequest, TR_ForceEarlyReturnRequest, TR_FrameCountReply, TR_FrameCountRequest, TR_FramesReply, TR_FramesRequest, TR_InterruptRequest, TR_NameReply, TR_NameRequest, TR_OwnedMonitorsReply, TR_OwnedMonitorsRequest, TR_OwnedMonitorsStackDepthInfoReply, TR_OwnedMonitorsStackDepthInfoRequest, TR_ResumeRequest, TR_StatusReply, TR_StatusRequest, TR_StopRequest, TR_SuspendCountReply, TR_SuspendCountRequest, TR_SuspendRequest, TR_ThreadGroupReply, TR_ThreadGroupRequest, VM_AllClassesReply, VM_AllClassesWithGenericReply, VM_AllThreadsReply, VM_CapabilitiesNewReply, VM_CapabilitiesReply, VM_ClassesBySignatureReply, VM_ClassesBySignatureRequest, VM_ClassPathsReply, VM_CreateStringReply, VM_CreateStringRequest, VM_DisposeObjectsRequest, VM_ExitRequest, VM_IDSizesReply, VM_InstanceCountsReply, VM_InstanceCountsRequest, VM_RedefineClassesRequest, VM_SetDefaultStratumRequest, VM_TopLevelThreadGroupsReply, VM_VersionReply } from "./JDWPProtocol";
import { fieldID, fieldIDSize, frameID, frameIDSize, interfaceID, javaLocation, javaValue, methodID, methodIDSize, objectIDSize, ReadBuffer, referenceTypeID, referenceTypeIDSize, taggedObjectID, threadGroupID, threadID, WriteBuffer } from "./buffer";
import { JdwpEventKind, JdwpModKind, JdwpTypeTag } from "./JDWPConstants";

const JDWP_HEADERLEN : number = 11;

export class JDWPClient extends EventEmitter
{
    protected socket : net.Socket;
    protected port : number;
    protected replyBuffer : Buffer;
    private reqId: number;
    private handshaked : boolean;
    private completers: { [key: number]: PromiseCompleter<Buffer> } = {}; 

    constructor(port : number)
    {
        super();
        this.port = port;
        this.reqId = 0;
        this.replyBuffer = Buffer.alloc(0);
        this.socket = new net.Socket();
        this.socket.on("data", (data) => this.handlePkt(data));
        this.socket.on("close", (error) => this.onClose(error));
        this.handshaked = false;
    }

    protected JdwpCommand(buffer : Buffer, commandset : number, command : number) : Promise<Buffer>
    {
        const id : number = this.reqId++
        const completer = new PromiseCompleter<Buffer>();
        this.completers[id] = completer;
        
        //construct the pkt
        let buf : Buffer = buffer;
        if (this.handshaked) {
            buf = Buffer.alloc(JDWP_HEADERLEN + buffer.length);
            buf.writeUInt32BE(buf.length, 0);
            buf.writeUInt32BE(id, 4);
            buf[8] = 0;
            buf[9] = commandset;
            buf[10] = command;
            if (buffer.length) {
                Buffer.from(buffer).copy(buf, 11);
            }
        }
        
        this.socket.write(buf);
        return completer.promise;
    }

    protected handlePkt(data : Buffer) : void
    {
        const resolveres = (id : number, response : Buffer) =>
        {
            const completer: PromiseCompleter<Buffer> = this.completers[id];
            if (completer) {
                delete this.completers[id];
                completer.resolve(response);
            }
            else {
                //never execute
            }
        };

        this.replyBuffer = Buffer.concat([this.replyBuffer, data]);
        let id : number = 0;
        let response : Buffer;
        if (!this.handshaked) {
            if (this.replyBuffer.length >= "JDWP-Handshake".length) {
                response = this.replyBuffer.slice(0, "JDWP-Handshake".length);
                this.replyBuffer = this.replyBuffer.slice("JDWP-Handshake".length);
                this.handshaked = true;
                resolveres(id, response);
            }
            return;
        }

        if (JDWP_HEADERLEN <= this.replyBuffer.length) {
            let len: number = this.replyBuffer.readUInt32BE(0);
            let flag : number = this.replyBuffer.readUInt8(8);

            for (; len <= this.replyBuffer.length; 
                len = this.replyBuffer.readUInt32BE(0), flag = this.replyBuffer.readUInt8(8)) {
                let id: number = this.replyBuffer.readUInt32BE(4);
                response = this.replyBuffer.slice(9, len);
                this.replyBuffer = this.replyBuffer.slice(len);

                if (flag & 0x80) {
                    resolveres(id, response);
                }
                else{
                    this.E_Composite(response);
                }

                if (this.replyBuffer.length < JDWP_HEADERLEN)
                {
                    break;
                }
                
            }
        }
    }

    protected onClose(error : boolean) : void
    {
        this.sendEvent("stop");
    }

    protected sendEvent(event : string, ...args : any[]) : void
    {
        setImmediate(_ => {
            this.emit(event, ...args);
        })
    }

    public async start() : Promise<void>
    {
        this.socket.connect(this.port, "localhost");

        await new Promise<void>((resolve) => {
            this.socket.once("connect", () => {
                resolve();
            })
        });

        let response : Buffer = await this.JdwpCommand(Buffer.from('JDWP-Handshake'), 0, 0);
        if (Buffer.compare(response, Buffer.from('JDWP-Handshake')))
        {
            await this.stop();
        }
    }

    public async stop() : Promise<void>
    {
        await this.VM_Dispose();
        this.socket.end();
    }

    //jdwp commands
    //VirtualMachine Command Set (1)
    //Version Command (1)
    public async VM_Version() : Promise<VM_VersionReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let description: string = pkt.readJavaString();
            let jdwpMajor: number = pkt.readUIntBE();
            let jdwpMinor: number = pkt.readUIntBE();
            let vmVersion: string = pkt.readJavaString();
            let vmName: string = pkt.readJavaString();
            return {
                "description" : description,
                "jdwpMajor" : jdwpMajor,
                "jdwpMinor" : jdwpMinor,
                "vmVersion" : vmVersion,
                "vmName" : vmName
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //ClassesBySignature Command (2)
    public async VM_ClassesBySignature(cmd : VM_ClassesBySignatureRequest) : Promise<VM_ClassesBySignatureReply | undefined>
    {
        let req : Buffer = Buffer.alloc(4 + cmd.signature.length);
        req.writeUInt32BE(cmd.signature.length);
        req.write(cmd.signature, 4, "utf-8");
        let response : Buffer = await this.JdwpCommand(req, 1, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();

        if (0 == errorcode) {
            let refTypeTags: JdwpTypeTag[] = [];
            let typeIDs: referenceTypeID[] = [];
            let statuses: number[] = [];
            let classes: number = pkt.readUIntBE();
            for (let i = 0; i < classes; i++) {
                refTypeTags.push(pkt.readByte());
                typeIDs.push(pkt.readReferenceTypeId());
                statuses.push(pkt.readUIntBE());
            }

            return {
                "classes" : classes,
                "refTypeTag" : refTypeTags,
                "typeID" : typeIDs,
                "status" : statuses
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //AllClasses Command (3)
    public async VM_AllClasses() : Promise<VM_AllClassesReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let classes: number = pkt.readUIntBE();
            let refTypeTags: JdwpTypeTag[] = [];
            let typeIDs: referenceTypeID[] = [];
            let signatures : string[] = [];
            let statuses: number[] = [];
            for (let i = 0; i < classes; i++)
            {
                refTypeTags.push(pkt.readByte());
                typeIDs.push(pkt.readReferenceTypeId());
                signatures.push(pkt.readJavaString());
                statuses.push(pkt.readUIntBE());
            }

            return {
                "classes" : classes,
                "refTypeTag" : refTypeTags,
                "typeID" : typeIDs,
                "signature" : signatures,
                "status" : statuses
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //AllThreads Command (4)
    public async VM_AllThreads() : Promise<VM_AllThreadsReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();

        if (0 == errorcode) {
            let threads: number = pkt.readUIntBE();
            let threadIds : threadID[] = [];
            for (let i = 0; i < threads; i++)
            {
                threadIds.push(pkt.readThreadId());
            }

            return {
                "thread" : threadIds,
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //TopLevelThreadGroups Command (5)
    public async VM_TopLevelThreadGroups() : Promise<VM_TopLevelThreadGroupsReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 5);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let groups: number = pkt.readUIntBE();
            let threadGroups : threadGroupID[] = [];
            for (let i = 0; i < groups; i++)
            {
                threadGroups.push(pkt.readThreadGroupId());
            }

            return {
                "group" : threadGroups,
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //Dispose Command (6)
    public async VM_Dispose() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 6);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //IDSizes Command (7)
    public async VM_IDSizes() : Promise<VM_IDSizesReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 7);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "fieldIDSize" : pkt.readUIntBE(),
                "methodIDSize" : pkt.readUIntBE(),
                "objectIDSize" : pkt.readUIntBE(),
                "referenceTypeIDSize" : pkt.readUIntBE(),
                "frameIDSize" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //Suspend Command (8)
    public async VM_Suspend() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 8);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //Resume Command (9)
    public async VM_Resume() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 9);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //Exit Command (10)
    public async VM_Exit(cmd : VM_ExitRequest) : Promise<void>
    {
        let req : Buffer = Buffer.alloc(4);
        req.writeUInt32BE(cmd.exitCode);
        let response : Buffer = await this.JdwpCommand(req, 1, 10);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //CreateString Command (11)
    public async VM_CreateString(cmd : VM_CreateStringRequest) : Promise<VM_CreateStringReply | undefined>
    {
        let req : Buffer = Buffer.alloc(4 + cmd.utf.length);
        req.writeUInt32BE(cmd.utf.length);
        req.write(cmd.utf, 4, "utf-8");
        let response : Buffer = await this.JdwpCommand(req, 1, 11);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "stringObject" : pkt.readStringId(),
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //Capabilities Command (12)
    public async VM_Capabilities() : Promise<VM_CapabilitiesReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 12);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "canWatchFieldModification" : pkt.readBoolean(),
                "canWatchFieldAccess" : pkt.readBoolean(),
                "canGetBytecodes" : pkt.readBoolean(),
                "canGetSyntheticAttribute" : pkt.readBoolean(),
                "canGetOwnedMonitorInfo" : pkt.readBoolean(),
                "canGetCurrentContendedMonitor" : pkt.readBoolean(),
                "canGetMonitorInfo" : pkt.readBoolean(),
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //ClassPaths Command (13)
    public async VM_ClassPaths() : Promise<VM_ClassPathsReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 13);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let baseDir : string = pkt.readJavaString();
            let classpaths : string[] = [];
            let bootclasspaths : string[] = [];
            let count: number = pkt.readUIntBE();
            for (let i = 0; i < count; i++)
            {
                classpaths.push(pkt.readJavaString());
            }

            count = pkt.readUIntBE();
            for (let i = 0; i < count; i++)
            {
                bootclasspaths.push(pkt.readJavaString());
            }

            return {
                "baseDir" : baseDir,
                "classpaths" : classpaths,
                "bootclasspaths" : bootclasspaths,
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //DisposeObjects Command (14)
    public async VM_DisposeObjects(cmd : VM_DisposeObjectsRequest) : Promise<void>
    {
        if (cmd.object.length != cmd.refCnt.length)
        {
            return ;
        }

        let pkt : WriteBuffer = new WriteBuffer(4 + (objectIDSize + 4)*cmd.object.length);
        pkt.writeUIntBE(cmd.object.length);
        pkt.writeObjectIdArray(cmd.object);
        pkt.writeUIntBEArray(cmd.refCnt);

        let response : Buffer = await this.JdwpCommand(pkt.getDataBuffer(), 1, 14);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //HoldEvents Command (15)
    public async VM_HoldEvents() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 15);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //ReleaseEvents Command (16)
    public async VM_ReleaseEvents() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 16);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //CapabilitiesNew Command (17)
    public async VM_CapabilitiesNew() : Promise<VM_CapabilitiesNewReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 17);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "canWatchFieldModification" : pkt.readBoolean(),
                "canWatchFieldAccess" : pkt.readBoolean(),
                "canGetBytecodes" : pkt.readBoolean(),
                "canGetSyntheticAttribute" : pkt.readBoolean(),
                "canGetOwnedMonitorInfo" : pkt.readBoolean(),
                "canGetCurrentContendedMonitor" : pkt.readBoolean(),
                "canGetMonitorInfo" : pkt.readBoolean(),
                "canRedefineClasses" : pkt.readBoolean(),
                "canAddMethod" : pkt.readBoolean(),
                "canUnrestrictedlyRedefineClasses" : pkt.readBoolean(),
                "canPopFrames" : pkt.readBoolean(),
                "canUseInstanceFilters" : pkt.readBoolean(),
                "canGetSourceDebugExtension" : pkt.readBoolean(),
                "canRequestVMDeathEvent" : pkt.readBoolean(),
                "canSetDefaultStratum" : pkt.readBoolean(),
                "canGetInstanceInfo" : pkt.readBoolean(),
                "canRequestMonitorEvents" : pkt.readBoolean(),
                "canGetMonitorFrameInfo" : pkt.readBoolean(),
                "canUseSourceNameFilters" : pkt.readBoolean(),
                "canGetConstantPool" : pkt.readBoolean(),
                "canForceEarlyReturn" : pkt.readBoolean(),
                "reserved22" : pkt.readBoolean(),
                "reserved23" : pkt.readBoolean(),
                "reserved24" : pkt.readBoolean(),
                "reserved25" : pkt.readBoolean(),
                "reserved26" : pkt.readBoolean(),
                "reserved27" : pkt.readBoolean(),
                "reserved28" : pkt.readBoolean(),
                "reserved29" : pkt.readBoolean(),
                "reserved30" : pkt.readBoolean(),
                "reserved31" : pkt.readBoolean(),
                "reserved32" : pkt.readBoolean(),
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //RedefineClasses Command (18)
    public async VM_RedefineClasses(cmd : VM_RedefineClassesRequest) : Promise<void>
    {
        if (cmd.classes != cmd.refType.length && cmd.classes != cmd.classbyte.length)
        {
            return ;
        }

        let len : number = 4 + (referenceTypeIDSize + 4)*cmd.classes;
        for (let k = 0; k < cmd.classes; k++)
        {
            len += cmd.classbyte[k].length;
        }

        let pkt : WriteBuffer = new WriteBuffer(len);
        pkt.writeUIntBE(cmd.classes);
        for (let j = 0; j < cmd.classes; j++)
        {
            pkt.writeReferenceTypeId(cmd.refType[j]);
            pkt.writeUIntBE(cmd.classbyte[j].length);
            pkt.writeBuffer(cmd.classbyte[j]);
        }

        let response : Buffer = await this.JdwpCommand(pkt.getDataBuffer(), 1, 18);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //SetDefaultStratum Command (19)
    public async VM_SetDefaultStratum(cmd : VM_SetDefaultStratumRequest) : Promise<void>
    {
        let req : Buffer = Buffer.alloc(4 + cmd.stratumID.length);
        req.writeUInt32BE(cmd.stratumID.length);
        req.write(cmd.stratumID, 4, "utf-8");
        let response : Buffer = await this.JdwpCommand(req, 1, 19);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //VirtualMachine Command Set (1)
    //AllClassesWithGeneric Command (20)
    public async VM_AllClassesWithGeneric() : Promise<VM_AllClassesWithGenericReply | undefined>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 1, 20);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let classes: number = pkt.readUIntBE();
            let refTypeTags: JdwpTypeTag[] = [];
            let typeIDs: referenceTypeID[] = [];
            let signatures : string[] = [];
            let genericSignatures : string[] = [];
            let statuses: number[] = [];
            for (let i = 0; i < classes; i++)
            {
                refTypeTags.push(pkt.readByte());
                typeIDs.push(pkt.readReferenceTypeId());
                signatures.push(pkt.readJavaString());
                genericSignatures.push(pkt.readJavaString());
                statuses.push(pkt.readUIntBE());
            }

            return {
                "classes" : classes,
                "refTypeTag" : refTypeTags,
                "typeID" : typeIDs,
                "signature" : signatures,
                "genericSignature" : genericSignatures,
                "status" : statuses
            };
        }

        return undefined;
    }

    //VirtualMachine Command Set (1)
    //InstanceCounts Command (21)
    public async VM_InstanceCounts(cmd : VM_InstanceCountsRequest) : Promise<VM_InstanceCountsReply | undefined>
    {
        let pkt : WriteBuffer = new WriteBuffer(4 + referenceTypeIDSize*cmd.refTypes.length);
        pkt.writeUIntBE(cmd.refTypes.length);
        pkt.writeReferenceTypeIdArray(cmd.refTypes);

        let response : Buffer = await this.JdwpCommand(pkt.getDataBuffer(), 1, 21);
        let resp : ReadBuffer = new ReadBuffer(response);
        let errorcode: number = resp.readUShortBE();
        if (0 == errorcode) {
            let counts: number = resp.readUIntBE();
            let instanceCounts : bigint[] = [];
            for (let i = 0; i < counts; i++)
            {
                instanceCounts.push(resp.readULongBE());
            }

            return {
                "instanceCount" : instanceCounts,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Signature Command (1)
    public async RT_Signature(cmd : RT_SignatureRequest) : Promise<RT_SignatureReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "signature" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //ClassLoader Command (2)
    public async RT_ClassLoader(cmd : RT_ClassLoaderRequest) : Promise<RT_ClassLoaderReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "classLoader" : pkt.readClassLoaderId(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Modifiers Command (3)
    public async RT_Modifiers(cmd : RT_ModifiersRequest) : Promise<RT_ModifiersReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "modBits" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Fields Command (4)
    public async RT_Fields(cmd : RT_FieldsRequest) : Promise<RT_FieldsReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let declared: number = pkt.readUIntBE();
            let fieldIds : fieldID[] = [];
            let names : string[] = [];
            let signatures : string[] = [];
            let modBitses : number[] = [];
            for (let i = 0; i < declared; i++)
            {
                fieldIds.push(pkt.readFieldId());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                modBitses.push(pkt.readUIntBE());
            }

            return {
                "declared" : declared,
                "fieldId" : fieldIds,
                "name" : names,
                "signature" : signatures,
                "modBits" : modBitses,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Methods Command (5)
    public async RT_Methods(cmd : RT_MethodsRequest) : Promise<RT_MethodsReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 5);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let declared: number = pkt.readUIntBE();
            let methodIds : methodID[] = [];
            let names : string[] = [];
            let signatures : string[] = [];
            let modBitses : number[] = [];
            for (let i = 0; i < declared; i++)
            {
                methodIds.push(pkt.readMethodId());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                modBitses.push(pkt.readUIntBE());
            }

            return {
                "declared" : declared,
                "methodId" : methodIds,
                "name" : names,
                "signature" : signatures,
                "modBits" : modBitses,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //GetValues Command (6)
    public async RT_GetValues(cmd : RT_GetValuesRequest) : Promise<RT_GetValuesReply | undefined>
    {
        //Returns the value of one or more static fields of the reference type
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + fieldIDSize * cmd.fieldIds.length + 4);
        req.writeReferenceTypeId(cmd.refType);
        req.writeFieldIdArray(cmd.fieldIds);
        req.writeUIntBE(cmd.fieldIds.length);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 6);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let values: number = pkt.readUIntBE();
            let javaValues : javaValue[] = [];
            for (let i = 0; i < values; i++)
            {
                javaValues.push(pkt.readValue());
            }

            return {
                "values" : javaValues,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //SourceFile Command (7)
    public async RT_SourceFile(cmd : RT_SourceFileRequest) : Promise<RT_SourceFileReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 7);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "sourceFile" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //NestedTypes Command (8)
    public async RT_NestedTypes(cmd : RT_NestedTypesRequest) : Promise<RT_NestedTypesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 8);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let classes: number = pkt.readUIntBE();
            let refTypeTags : JdwpTypeTag[] = [];
            let typeIDs : referenceTypeID[] = [];
            for (let i = 0; i < classes; i++)
            {
                refTypeTags.push(pkt.readByte());
                typeIDs.push(pkt.readReferenceTypeId());
            }

            return {
                "classes" : classes,
                "refTypeTags" : refTypeTags,
                "typeIDs" : typeIDs,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Status Command (9)
    public async RT_Status(cmd : RT_StatusRequest) : Promise<RT_StatusReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 9);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "status" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Interfaces Command (10)
    public async RT_Interfaces(cmd : RT_InterfacesRequest) : Promise<RT_InterfacesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 10);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let interfaces: number = pkt.readUIntBE();
            let interfaceTypes : interfaceID[] = [];
            for (let i = 0; i < interfaces; i++)
            {
                interfaceTypes.push(pkt.readInterfaceId());
            }

            return {
                "interfaceTypes" : interfaceTypes,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //ClassObject Command (11)
    public async RT_ClassObject(cmd : RT_ClassObjectRequest) : Promise<RT_ClassObjectReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 11);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "classObject" : pkt.readClassObjectId(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //SourceDebugExtension Command (12)
    public async RT_SourceDebugExtension(cmd : RT_SourceDebugExtensionRequest) : Promise<RT_SourceDebugExtensionReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 12);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "extension" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //SignatureWithGeneric Command (13)
    public async RT_SignatureWithGeneric(cmd : RT_SignatureWithGenericRequest) : Promise<RT_SignatureWithGenericReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 13);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "signature" : pkt.readJavaString(),
                "genericSignature" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //FieldsWithGeneric Command (14)
    public async RT_FieldsWithGeneric(cmd : RT_FieldsWithGenericRequest) : Promise<RT_FieldsWithGenericReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 14);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let declared: number = pkt.readUIntBE();
            let fieldIds: fieldID[] = [];
            let names: string[] = [];
            let signatures : string[] = [];
            let genericSignatures : string[] = [];
            let modBitses: number[] = [];
            for (let i = 0; i < declared; i++)
            {
                fieldIds.push(pkt.readFieldId());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                genericSignatures.push(pkt.readJavaString());
                modBitses.push(pkt.readUIntBE());
            }

            return {
                "declared" : declared,
                "fieldIDs" : fieldIds,
                "names" : names,
                "signatures" : signatures,
                "genericSignature" : genericSignatures,
                "modBits" : modBitses,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //MethodsWithGeneric Command (15)
    public async RT_MethodsWithGeneric(cmd : RT_MethodsWithGenericRequest) : Promise<RT_MethodsWithGenericReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 15);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let declared: number = pkt.readUIntBE();
            let methodIds: methodID[] = [];
            let names: string[] = [];
            let signatures : string[] = [];
            let genericSignatures : string[] = [];
            let modBitses: number[] = [];
            for (let i = 0; i < declared; i++)
            {
                methodIds.push(pkt.readMethodId());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                genericSignatures.push(pkt.readJavaString());
                modBitses.push(pkt.readUIntBE());
            }

            return {
                "declared" : declared,
                "methodIDs" : methodIds,
                "names" : names,
                "signatures" : signatures,
                "genericSignatures" : genericSignatures,
                "modBits" : modBitses,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //Instances Command (16)
    public async RT_Instances(cmd : RT_InstancesRequest) : Promise<RT_InstancesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + 4);
        req.writeReferenceTypeId(cmd.refType);
        req.writeUIntBE(cmd.maxInstances);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 16);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let count: number = pkt.readUIntBE();
            let instances : taggedObjectID[] = [];
            for (let i = 0; i < count; i++)
            {
                instances.push(pkt.readTaggedObjectId());
            }
            
            return {
                "instances" : instances,
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //ClassFileVersion Command (17)
    public async RT_ClassFileVersion(cmd : RT_ClassFileVersionRequest) : Promise<RT_ClassFileVersionReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 17);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "majorVersion" : pkt.readUIntBE(),
                "minorVersion" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ReferenceType Command Set (2)
    //ConstantPool Command (18)
    public async RT_ConstantPool(cmd : RT_ConstantPoolRequest) : Promise<RT_ConstantPoolReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.refType);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 2, 18);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let count : number = pkt.readUIntBE();
            let bytes : number = pkt.readUIntBE();
            let cpbytes : Buffer = Buffer.alloc(bytes);

            //todo : directly copy
            for (let i = 0; i < bytes; i++)
            {
                cpbytes.writeUInt8(pkt.readByte());
            }

            return {
                "count" : count,
                "cpbytes" : cpbytes,
            };
        }

        return undefined;
    }

    //ClassType Command Set (3)
    //Superclass Command (1)
    public async CT_Superclass(cmd : CT_SuperclassRequest) : Promise<CT_SuperclassReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize);
        req.writeReferenceTypeId(cmd.clazz);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 3, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "superclass" : pkt.readClassId(),
            };
        }

        return undefined;
    }

    //ClassType Command Set (3)
    //SetValues Command (2)
    public async CT_SetValues(cmd : CT_SetValuesRequest) : Promise<boolean>
    {
        if (cmd.count != cmd.fieldIds.length || 
            cmd.count != cmd.values.length)
        {
            return false;
        }

        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + 4 + fieldIDSize*cmd.count + 8*cmd.count);
        req.writeClassId(cmd.clazz);
        req.writeUIntBE(cmd.count);
        for (let i = 0; i < cmd.count; i++)
        {
            req.writeFieldId(cmd.fieldIds[i]);
            req.writeUntaggedValue(cmd.values[i]);
        }

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 3, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return true;
        }

        return false;
    }

    //ClassType Command Set (3)
    //InvokeMethod Command (3)
    public async CT_InvokeMethod(cmd : CT_InvokeMethodRequest) : Promise<CT_InvokeMethodReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + 
            objectIDSize + methodIDSize + 4 + 9*cmd.args.length + 4);
        req.writeClassId(cmd.clazz);
        req.writeThreadId(cmd.thread);
        req.writeMethodId(cmd.methodId);
        req.writeUIntBE(cmd.args.length);
        req.writeValueArray(cmd.args);
        req.writeUIntBE(cmd.options);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 3, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "returnValue" : pkt.readValue(),
                "exception" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //ClassType Command Set (3)
    //NewInstance Command (4)
    public async CT_NewInstance(cmd : CT_NewInstanceRequest) : Promise<CT_NewInstanceReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + 
            objectIDSize + methodIDSize + 4 + 9*cmd.args.length + 4);
        req.writeClassId(cmd.clazz);
        req.writeThreadId(cmd.thread);
        req.writeMethodId(cmd.methodId);
        req.writeUIntBE(cmd.args.length);
        req.writeValueArray(cmd.args);
        req.writeUIntBE(cmd.options);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 3, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "newObject" : pkt.readTaggedObjectId(),
                "exception" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //ArrayType Command Set (4)
    //NewInstance Command (1)
    public async AT_NewInstance(cmd : AT_NewInstanceRequest) : Promise<AT_NewInstanceReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + 4);
        req.writeReferenceTypeId(cmd.arrType);
        req.writeUIntBE(cmd.length);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 4, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "newArray" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //InterfaceType Command Set (5)
    //None

    //Method Command Set (6)
    //LineTable Command (1)
    public async M_LineTable(cmd : M_LineTableRequest) : Promise<M_LineTableReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + methodIDSize);
        req.writeReferenceTypeId(cmd.refType);
        req.writeMethodId(cmd.methodId);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 6, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let start : bigint = pkt.readULongBE();
            let end : bigint = pkt.readULongBE();
            let lines : number = pkt.readUIntBE();
            let lineCodeIndexs : bigint[] = [];
            let lineNumbers : number[] = [];
            for (let i = 0; i < lines; i++)
            {
                lineCodeIndexs.push(pkt.readULongBE());
                lineNumbers.push(pkt.readUIntBE());
            }

            return {
                "start" : start,
                "end" : end,
                "lines" : lines,
                "lineCodeIndexs" : lineCodeIndexs,
                "lineNumbers" : lineNumbers,
            };
        }

        return undefined;
    }

    //Method Command Set (6)
    //VariableTable Command (2)
    public async M_VariableTable(cmd : M_VariableTableRequest) : Promise<M_VariableTableReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + methodIDSize);
        req.writeReferenceTypeId(cmd.refType);
        req.writeMethodId(cmd.methodId);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 6, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let argCnt: number = pkt.readUIntBE();
            let count: number = pkt.readUIntBE();
            let codeIndexs: bigint[] = [];
            let names: string[] = [];
            let signatures: string[] = [];
            let lengths: number[] = [];
            let slots: number[] = [];
            for (let i = 0; i < count; i++)
            {
                codeIndexs.push(pkt.readULongBE());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                lengths.push(pkt.readUIntBE());
                slots.push(pkt.readUIntBE());
            }

            return {
                "argCnt" : argCnt,
                "count" : count,
                "codeIndexs" : codeIndexs,
                "names" : names,
                "signatures" : signatures,
                "lengths" : lengths,
                "slots" : slots,
            };
        }

        return undefined;
    }

    //Method Command Set (6)
    //Bytecodes Command (3)
    public async M_Bytecodes(cmd : M_BytecodesRequest) : Promise<M_BytecodesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + methodIDSize);
        req.writeReferenceTypeId(cmd.refType);
        req.writeMethodId(cmd.methodId);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 6, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "bytecodes" : pkt.readFromBuffer(),
            };
        }

        return undefined;
    }

    //Method Command Set (6)
    //IsObsolete Command (4)
    public async M_IsObsolete(cmd : M_IsObsoleteRequest) : Promise<M_IsObsoleteReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + methodIDSize);
        req.writeReferenceTypeId(cmd.refType);
        req.writeMethodId(cmd.methodId);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 6, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "isObsolete" : pkt.readBoolean(),
            };
        }

        return undefined;
    }

    //Method Command Set (6)
    //VariableTableWithGeneric Command (5)
    public async M_VariableTableWithGeneric(cmd : M_VariableTableWithGenericRequest) 
    : Promise<M_VariableTableWithGenericReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(referenceTypeIDSize + methodIDSize);
        req.writeReferenceTypeId(cmd.refType);
        req.writeMethodId(cmd.methodId);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 6, 5);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let argCnt: number = pkt.readUIntBE();
            let count: number = pkt.readUIntBE();
            let codeIndexs: bigint[] = [];
            let names: string[] = [];
            let signatures: string[] = [];
            let genericSignatures : string[] = [];
            let lengths: number[] = [];
            let slots: number[] = [];
            for (let i = 0; i < count; i++)
            {
                codeIndexs.push(pkt.readULongBE());
                names.push(pkt.readJavaString());
                signatures.push(pkt.readJavaString());
                genericSignatures.push(pkt.readJavaString());
                lengths.push(pkt.readUIntBE());
                slots.push(pkt.readUIntBE());
            }

            return {
                "argCnt" : argCnt,
                "count" : count,
                "codeIndexs" : codeIndexs,
                "names" : names,
                "signatures" : signatures,
                "genericSignatures" : genericSignatures,
                "lengths" : lengths,
                "slots" : slots,
            };
        }

        return undefined;
    }

    //Field Command Set (8)
    //None

    //ObjectReference Command Set (9)
    //ReferenceType Command (1)
    public async OR_ReferenceType(cmd : OR_ReferenceTypeRequest) : Promise<OR_ReferenceTypeReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeObjectId(cmd.object);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "refTypeTag" : pkt.readByte(),
                "typeID" : pkt.readReferenceTypeId(),
            };
        }

        return undefined;
    }

    //ObjectReference Command Set (9)
    //GetValues Command (2)
    public async OR_GetValues(cmd : OR_GetValuesRequest) : Promise<OR_GetValuesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4 + fieldIDSize*cmd.fieldIds.length);
        req.writeObjectId(cmd.object);
        req.writeUIntBE(cmd.fieldIds.length);
        req.writeFieldIdArray(cmd.fieldIds);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "values" : pkt.readValueArray(),
            };
        }

        return undefined;
    }

    //ObjectReference Command Set (9)
    //SetValues Command (3)
    public async OR_SetValues(cmd : OR_SetValuesRequest) : Promise<boolean>
    {
        if (cmd.count != cmd.values.length || 
            cmd.count != cmd.fieldIds.length)
        {
            return false;
        }

        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4 + fieldIDSize*cmd.count + 8*cmd.count);
        req.writeObjectId(cmd.object);
        req.writeUIntBE(cmd.count);
        for (let i = 0; i < cmd.count; i++)
        {
            req.writeFieldId(cmd.fieldIds[i]);
            req.writeUntaggedValue(cmd.values[i]);
        }

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return true;
        }

        return false;
    }

    //ObjectReference Command Set (9)
    //MonitorInfo Command (5)
    public async OR_MonitorInfo(cmd : OR_MonitorInfoRequest) : Promise<OR_MonitorInfoReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeObjectId(cmd.object);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 5);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "owner" : pkt.readThreadId(),
                "entryCount" : pkt.readUIntBE(),
                "threads" : pkt.readThreadIdArray(),
            };
        }

        return undefined;
    }

    //ObjectReference Command Set (9)
    //InvokeMethod Command (6)
    public async OR_InvokeMethod(cmd : OR_InvokeMethodRequest) : Promise<OR_InvokeMethodReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 
            objectIDSize + referenceTypeIDSize + methodIDSize + 4 + 9*cmd.args.length + 4);
        req.writeObjectId(cmd.object);
        req.writeThreadId(cmd.thread);
        req.writeClassId(cmd.clazz);
        req.writeMethodId(cmd.methodId);
        req.writeUIntBE(cmd.args.length);
        req.writeValueArray(cmd.args);
        req.writeUIntBE(cmd.options);
        
        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 6);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "returnValue" : pkt.readValue(),
                "exception" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //ObjectReference Command Set (9)
    //DisableCollection Command (7)
    public async OR_DisableCollection(cmd : OR_DisableCollectionRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeObjectId(cmd.object);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 7);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ObjectReference Command Set (9)
    //EnableCollection Command (8)
    public async OR_EnableCollection(cmd : OR_EnableCollectionRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeObjectId(cmd.object);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 8);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ObjectReference Command Set (9)
    //IsCollected Command (9)
    public async OR_IsCollected(cmd : OR_IsCollectedRequest) : Promise<OR_IsCollectedReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeObjectId(cmd.object);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 9);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "isCollected" : pkt.readBoolean(),
            };
        }

        return undefined;
    }

    //ObjectReference Command Set (9)
    //ReferringObjects Command (10)
    public async OR_ReferringObjects(cmd : OR_ReferringObjectsRequest) : Promise<OR_ReferringObjectsReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4);
        req.writeObjectId(cmd.object);
        req.writeUIntBE(cmd.maxReferrers);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 9, 10);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "instances" : pkt.readTaggedObjectIdArray(),
            };
        }

        return undefined;
    }

    //StringReference Command Set (10)
    //Value Command (1)
    public async SR_Value(cmd : SR_ValueRequest) : Promise<SR_ValueReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeStringId(cmd.stringObject);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 10, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "stringValue" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //Name Command (1)
    public async TR_Name(cmd : TR_NameRequest) : Promise<TR_NameReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "threadName" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //Suspend Command (2)
    public async TR_Suspend(cmd : TR_SuspendRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
        }
    }

    //ThreadReference Command Set (11)
    //Resume Command (3)
    public async TR_Resume(cmd : TR_ResumeRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ThreadReference Command Set (11)
    //Status Command (4)
    public async TR_Status(cmd : TR_StatusRequest) : Promise<TR_StatusReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "threadStatus" : pkt.readUIntBE(),
                "suspendStatus" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //ThreadGroup Command (5)
    public async TR_ThreadGroup(cmd : TR_ThreadGroupRequest) : Promise<TR_ThreadGroupReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 5);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "group" : pkt.readThreadGroupId(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //Frames Command (6)
    public async TR_Frames(cmd : TR_FramesRequest) : Promise<TR_FramesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4 + 4);
        req.writeThreadId(cmd.thread);
        req.writeUIntBE(cmd.startFrame);
        req.writeUIntBE(cmd.length);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 6);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let frames : number = pkt.readUIntBE();
            let frameIds : frameID[] = [];
            let locations : javaLocation[] = [];
            for (let i = 0; i < frames; i++)
            {
                frameIds.push(pkt.readFrameId());
                locations.push(pkt.readLocation());
            }

            return {
                "frames" : frames,
                "frameIds" : frameIds,
                "locations" : locations,
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //FrameCount Command (7)
    public async TR_FrameCount(cmd : TR_FrameCountRequest) : Promise<TR_FrameCountReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 7);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "frameCount" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //OwnedMonitors Command (8)
    public async TR_OwnedMonitors(cmd : TR_OwnedMonitorsRequest) : Promise<TR_OwnedMonitorsReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 8);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "monitors" : pkt.readTaggedObjectIdArray(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //CurrentContendedMonitor Command (9)
    public async TR_CurrentContendedMonitor(cmd : TR_CurrentContendedMonitorRequest) : Promise<TR_CurrentContendedMonitorReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 9);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "monitor" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //Stop Command (10)
    public async TR_Stop(cmd : TR_StopRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize*2);
        req.writeThreadId(cmd.thread);
        req.writeObjectId(cmd.throwable);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 10);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ThreadReference Command Set (11)
    //Interrupt Command (11)
    public async TR_Interrupt(cmd : TR_InterruptRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 11);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ThreadReference Command Set (11)
    //SuspendCount Command (12)
    public async TR_SuspendCount(cmd : TR_SuspendCountRequest) : Promise<TR_SuspendCountReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 12);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "suspendCount" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //OwnedMonitorsStackDepthInfo Command (13)
    public async TR_OwnedMonitorsStackDepthInfo(cmd : TR_OwnedMonitorsStackDepthInfoRequest) 
                        : Promise<TR_OwnedMonitorsStackDepthInfoReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadId(cmd.thread);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 13);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let owned: number = pkt.readUIntBE();
            let monitors : taggedObjectID[] = [];
            let stack_depths: number[] = [];
            for (let i = 0; i < owned; i++)
            {
                monitors.push(pkt.readTaggedObjectId());
                stack_depths.push(pkt.readUIntBE());
            }

            return {
                "owned" : owned,
                "monitors" : monitors,
                "stack_depths" : stack_depths,
            };
        }

        return undefined;
    }

    //ThreadReference Command Set (11)
    //ForceEarlyReturn Command (14)
    public async TR_ForceEarlyReturn(cmd : TR_ForceEarlyReturnRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 1 + 8);
        req.writeThreadId(cmd.thread);
        req.writeValue(cmd.value);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 11, 14);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ThreadGroupReference Command Set (12)
    //Name Command (1)
    public async TGR_Name(cmd : TGR_NameRequest) : Promise<TGR_NameReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadGroupId(cmd.group);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 12, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "groupName" : pkt.readJavaString(),
            };
        }

        return undefined;
    }

    //ThreadGroupReference Command Set (12)
    //Parent Command (2)
    public async TGR_Parent(cmd : TGR_ParentRequest) : Promise<TGR_ParentReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadGroupId(cmd.group);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 12, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "parentGroup" : pkt.readThreadGroupId(),
            };
        }

        return undefined;
    }

    //ThreadGroupReference Command Set (12)
    //Children Command (3)
    public async TGR_Children(cmd : TGR_ChildrenRequest) : Promise<TGR_ChildrenReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeThreadGroupId(cmd.group);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 12, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "childThreads" : pkt.readThreadIdArray(),
                "childGroups" : pkt.readThreadGroupIdArray(),
            };
        }

        return undefined;
    }

    //ArrayReference Command Set (13)
    //Length Command (1)
    public async AR_Length(cmd : AR_LengthRequest) : Promise<AR_LengthReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeArrayId(cmd.arrayObject);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 13, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "arrayLength" : pkt.readUIntBE(),
            };
        }

        return undefined;
    }

    //ArrayReference Command Set (13)
    //GetValues Command (2)
    public async AR_GetValues(cmd : AR_GetValuesRequest) : Promise<AR_GetValuesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4 + 4);
        req.writeArrayId(cmd.arrayObject);
        req.writeIntBE(cmd.firstIndex);
        req.writeIntBE(cmd.length);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 13, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "values" : pkt.readArrayregion(),
            };
        }
        
        return undefined;
    }

    //ArrayReference Command Set (13)
    //SetValues Command (3)
    public async AR_SetValues(cmd : AR_SetValuesRequest) : Promise<boolean>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + 4 + 4 + 8*cmd.values.length);
        req.writeArrayId(cmd.arrayObject);
        req.writeUIntBE(cmd.firstIndex);
        req.writeUIntBE(cmd.values.length);
        req.writeUntaggedValueArray(cmd.values);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 13, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return true;
        }

        return false;
    }

    //ClassLoaderReference Command Set (14)
    //VisibleClasses Command (1)
    public async CLR_VisibleClasses(cmd : CLR_VisibleClassesRequest) : Promise<CLR_VisibleClassesReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize);
        req.writeClassLoaderId(cmd.classLoaderObject);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 14, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            let classes: number = pkt.readUIntBE();
            let refTypeTags: JdwpTypeTag[] = [];
            let typeIds: referenceTypeID[] = [];
            for (let i = 0; i < classes; i++)
            {
                refTypeTags.push(pkt.readByte());
                typeIds.push(pkt.readReferenceTypeId());
            }

            return {
                "classes" : classes,
                "refTypeTags" : refTypeTags,
                "typeIds" : typeIds,
            };
        }

        return undefined;
    }

    //EventRequest Command Set (15)
    //Set Command (1)
    public async ER_Set(cmd : ER_SetRequest) : Promise<ER_SetReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(200, true);//min size
        req.writeByte(cmd.eventKind);
        req.writeByte(cmd.suspendPolicy);
        req.writeUIntBE(cmd.modifiers.length);

        for (let i = 0; i < cmd.modifiers.length; i++)
        {
            req.writeByte(cmd.modifiers[i].modKind);
            let modifier : JavaModifier = cmd.modifiers[i];
            switch (cmd.modifiers[i].modKind)
            {
                case JdwpModKind.MK_COUNT:
                    if (modifier.count)
                    {
                        req.writeUIntBE(modifier.count);
                    }
                    break;
                case JdwpModKind.MK_CONDITIONAL:
                    if (modifier.exprID)
                    {
                        req.writeUIntBE(modifier.exprID);
                    }
                    break;
                case JdwpModKind.MK_THREAD_ONLY:
                    if (modifier.thread)
                    {
                        req.writeThreadId(modifier.thread);
                    }
                    break;
                case JdwpModKind.MK_CLASS_ONLY:
                    if (modifier.clazz)
                    {
                        req.writeReferenceTypeId(modifier.clazz);
                    }
                    break;
                case JdwpModKind.MK_CLASS_MATCH:
                case JdwpModKind.MK_CLASS_EXCLUDE:
                    if (modifier.classPattern)
                    {
                        req.writeJavaString(modifier.classPattern);
                    }
                    break;
                case JdwpModKind.MK_LOCATION_ONLY:
                    if (modifier.loc)
                    {
                        req.writeLocation(modifier.loc);
                    }
                    break;
                case JdwpModKind.MK_EXCEPTION_ONLY:
                    if (modifier.exceptionOrNull && 
                        modifier.caught &&
                        modifier.uncaught)
                    {
                        req.writeReferenceTypeId(modifier.exceptionOrNull);
                        req.writeBoolean(modifier.caught);
                        req.writeBoolean(modifier.uncaught);
                    }
                    break;
                case JdwpModKind.MK_FIELD_ONLY:
                    if (modifier.declaring && 
                        modifier.fieldId)
                    {
                        req.writeReferenceTypeId(modifier.declaring);
                        req.writeFieldId(modifier.fieldId);
                    }
                    break;
                case JdwpModKind.MK_STEP:
                    if (modifier.thread && 
                        modifier.size &&
                        modifier.depth)
                    {
                        req.writeThreadId(modifier.thread);
                        req.writeUIntBE(modifier.size);
                        req.writeUIntBE(modifier.depth);
                    }
                    break;
                case JdwpModKind.MK_INSTANCE_ONLY:
                    if (modifier.instance)
                    {
                        req.writeObjectId(modifier.instance);
                    }
                    break;
                case JdwpModKind.MK_SOURCENAME_MATCH:
                    if (modifier.sourceNamePattern)
                    {
                        req.writeJavaString(modifier.sourceNamePattern);
                    }
                    break;
                default:
                    throw("Invalid modifier kind.");
            }
        }

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 15, 1);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            return {
                "requestID" : response.readUInt32BE(2),
            };
        }

        return undefined;
    }

    //EventRequest Command Set (15)
    //Clear Command (2)
    public async ER_Clear(cmd : ER_ClearRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(1 + 4);
        req.writeByte(cmd.eventKind);
        req.writeUIntBE(cmd.requestID);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 15, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //EventRequest Command Set (15)
    //ClearAllBreakpoints Command (3)
    public async ER_ClearAllBreakpoints() : Promise<void>
    {
        let response : Buffer = await this.JdwpCommand(Buffer.alloc(0), 15, 3);
        let errorcode: number = response.readUInt16BE(0);
        if (0 == errorcode) {
            //
        }
    }

    //StackFrame Command Set (16)
    //GetValues Command (1)
    public async SF_GetValues(cmd : SF_GetValuesRequest) : Promise<SF_GetValuesReply | undefined>
    {
        if (cmd.count != cmd.slots.length || 
            cmd.count != cmd.sigbytes.length)
        {
            return undefined;
        }

        let req : WriteBuffer = new WriteBuffer(objectIDSize + frameIDSize + 4 + 5*cmd.count);
        req.writeThreadId(cmd.thread);
        req.writeFrameId(cmd.frame);
        req.writeUIntBE(cmd.count);
        for (let i = 0; i < cmd.count; i++)
        {
            req.writeUIntBE(cmd.slots[i]);
            req.writeByte(cmd.sigbytes[i]);
        }

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 16, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "slotValues" : pkt.readValueArray(),
            };
        }

        return undefined;
    }

    //StackFrame Command Set (16)
    //SetValues Command (2)
    public async SF_SetValues(cmd : SF_SetValuesRequest) : Promise<boolean>
    {
        if (cmd.count != cmd.slots.length || 
            cmd.count != cmd.slotValues.length)
        {
            return false;
        }

        let req : WriteBuffer = new WriteBuffer(objectIDSize + frameIDSize + 4 + (4 + 1 + 8)*cmd.count);
        req.writeThreadId(cmd.thread);
        req.writeFrameId(cmd.frame);
        req.writeUIntBE(cmd.count);
        for (let i = 0; i < cmd.count; i++)
        {
            req.writeUIntBE(cmd.slots[i]);
            req.writeValue(cmd.slotValues[i]);
        }

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 16, 2);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return true;
        }

        return false;
    }

    //StackFrame Command Set (16)
    //ThisObject Command (3)
    public async SF_ThisObject(cmd : SF_ThisObjectRequest) : Promise<SF_ThisObjectReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + frameIDSize);
        req.writeThreadId(cmd.thread);
        req.writeFrameId(cmd.frame);
        
        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 16, 3);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "objectThis" : pkt.readTaggedObjectId(),
            };
        }

        return undefined;
    }

    //StackFrame Command Set (16)
    //PopFrames Command (4)
    public async SF_PopFrames(cmd : SF_PopFramesRequest) : Promise<void>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize + frameIDSize);
        req.writeThreadId(cmd.thread);
        req.writeFrameId(cmd.frame);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 16, 4);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            //
        }
    }

    //ClassObjectReference Command Set (17)
    //ReflectedType Command (1)
    public async COR_ReflectedType(cmd : COR_ReflectedTypeRequest) : Promise<COR_ReflectedTypeReply | undefined>
    {
        let req : WriteBuffer = new WriteBuffer(objectIDSize)
        req.writeClassObjectId(cmd.classObject);

        let response : Buffer = await this.JdwpCommand(req.getDataBuffer(), 17, 1);
        let pkt: ReadBuffer = new ReadBuffer(response);
        let errorcode: number = pkt.readUShortBE();
        if (0 == errorcode) {
            return {
                "refTypeTag" : pkt.readByte(),
                "typeID" : pkt.readReferenceTypeId(),
            };
        }

        return undefined;
    }

    //Event Command Set (64)
    //Composite Command (100)
    public async E_Composite(pkt : Buffer) : Promise<void>
    {
        let response: ReadBuffer = new ReadBuffer(pkt);
        let cmdset : number = response.readByte();
        let cmd : number = response.readByte();
        if (cmdset != 64 || cmd != 100)
        {
            throw("unknown event command.");
        }

        let suspendPolicy : number = response.readByte();
        let count : number = response.readUIntBE();
        let events : JavaEvent[] = [];
        for (let i = 0; i < count; i++)
        {
            let eventKind : number = response.readByte();
            let requestID : number = response.readUIntBE();
            switch (eventKind) {
                case JdwpEventKind.EK_VM_START:
                case JdwpEventKind.EK_THREAD_START:
                case JdwpEventKind.EK_THREAD_DEATH:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_SINGLE_STEP:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "location" : response.readLocation(),
                        });

                        this.ER_Clear({
                            "eventKind" : JdwpEventKind.EK_SINGLE_STEP, 
                            "requestID" : requestID,
                        });
                    }
                    break;
                case JdwpEventKind.EK_BREAKPOINT:
                case JdwpEventKind.EK_METHOD_ENTRY:
                case JdwpEventKind.EK_METHOD_EXIT:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "location" : response.readLocation(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_EXCEPTION:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "location" : response.readLocation(),
                            "exception" : response.readTaggedObjectId(),
                            "catchLocation" : response.readLocation(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_CLASS_PREPARE:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "refTypeTag" : response.readByte(),
                            "typeID" : response.readReferenceTypeId(),
                            "signature" : response.readJavaString(),
                            "status" : response.readUIntBE(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_CLASS_UNLOAD:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "signature" : response.readJavaString(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_FIELD_ACCESS:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "location" : response.readLocation(),
                            "refTypeTag" : response.readByte(),
                            "typeID" : response.readReferenceTypeId(),
                            "fieldId" : response.readFieldId(),
                            "object" : response.readTaggedObjectId(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_FIELD_MODIFICATION:
                    {
                        events.push({
                            "eventKind" : eventKind,
                            "requestID" : requestID,
                            "thread" : response.readThreadId(),
                            "location" : response.readLocation(),
                            "refTypeTag" : response.readByte(),
                            "typeID" : response.readReferenceTypeId(),
                            "fieldId" : response.readFieldId(),
                            "object" : response.readTaggedObjectId(),
                            "value" : response.readValue(),
                        });
                    }
                    break;
                case JdwpEventKind.EK_VM_DEATH:
                    events.push({
                        "eventKind" : eventKind,
                        "requestID" : requestID,
                    });
                    break;
                default:
                    break;
            }
        }

        this.sendEvent("javaEvent", events);
    }

}
