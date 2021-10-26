//nagative url  https://docs.oracle.com/javase/7/docs/platform/jpda/jdwp/jdwp-protocol.html#JDWP_StackFrame_PopFrames
//for details. 

import { javaArrayregion, javaLocation, javaValue, taggedObjectID,
        objectID, threadID, threadGroupID, stringID, classLoaderID,
        classObjectID, arrayID, referenceTypeID, classID, interfaceID,
        arrayTypeID, methodID, fieldID, frameID, javaUntaggedValue } from "./buffer";
import { JdwpClassStatus, JdwpEventKind, JdwpModKind, JdwpStepDepth, JdwpStepSize, JdwpSuspendPolicy, JdwpType, JdwpTypeTag } from "./JDWPConstants";

/**
VirtualMachine Command Set (1)
**/
//Version Command (1)
export interface VM_VersionRequest
{
    //none
}

export interface VM_VersionReply
{
    description : string;
    jdwpMajor : number;
    jdwpMinor : number;
    vmVersion : string;
    vmName : string;
}

//ClassesBySignature Command (2)
export interface VM_ClassesBySignatureRequest
{
    signature : string;
}

export interface VM_ClassesBySignatureReply
{
    classes : number;
    refTypeTag : JdwpTypeTag[];
    typeID : referenceTypeID[];
    status : number[];
}

//AllClasses Command (3)
export interface VM_AllClassesRequest
{
    //none
}

export interface VM_AllClassesReply
{
    classes : number;
    refTypeTag : JdwpTypeTag[];
    typeID : referenceTypeID[];
    signature : string[];
    status : number[];
}

//AllThreads Command (4)
export interface VM_AllThreadsRequest
{
    //none
}

export interface VM_AllThreadsReply
{
    thread : threadID[];
}

//TopLevelThreadGroups Command (5)
export interface VM_TopLevelThreadGroupsRequest
{
    //none
}

export interface VM_TopLevelThreadGroupsReply
{
    group : threadGroupID[];
}

//Dispose Command (6)
export interface VM_DisposeRequest
{
    //none
}

export interface VM_DisposeReply
{
    //none
}

//IDSizes Command (7)
export interface VM_IDSizesRequest
{
    //none
}

export interface VM_IDSizesReply
{
    fieldIDSize : number;
    methodIDSize : number;
    objectIDSize : number;
    referenceTypeIDSize : number;
    frameIDSize : number;
}

//Suspend Command (8)
export interface VM_SuspendRequest
{
    //none
}

export interface VM_SuspendReply
{
    //none
}

//Resume Command (9)
export interface VM_ResumeRequest
{
    //none
}

export interface VM_ResumeReply
{
    //none
}

//Exit Command (10)
export interface VM_ExitRequest
{
    exitCode : number;
}

export interface VM_ExitReply
{
    //none
}

//CreateString Command (11)
export interface VM_CreateStringRequest
{
    utf : string;
}

export interface VM_CreateStringReply
{
    stringObject : stringID;
}

//Capabilities Command (12)
export interface VM_CapabilitiesRequest
{
    //none
}

export interface VM_CapabilitiesReply
{
    canWatchFieldModification : boolean;
    canWatchFieldAccess : boolean;
    canGetBytecodes : boolean;
    canGetSyntheticAttribute : boolean;
    canGetOwnedMonitorInfo : boolean;
    canGetCurrentContendedMonitor : boolean;
    canGetMonitorInfo : boolean;
}

//ClassPaths Command (13)
export interface VM_ClassPathsRequest
{
    //none
}

export interface VM_ClassPathsReply
{
    baseDir : string;
    classpaths : string[];
    bootclasspaths : string[];
}

//DisposeObjects Command (14)
export interface VM_DisposeObjectsRequest
{
    object : objectID[];
    refCnt : number[];
}

export interface VM_DisposeObjectsReply
{
    //none
}

//HoldEvents Command (15)
export interface VM_HoldEventsRequest
{
    //none
}

export interface VM_HoldEventsReply
{
    //none
}

//ReleaseEvents Command (16)
export interface VM_ReleaseEventsRequest
{
    //none
}

export interface VM_ReleaseEventsReply
{
    //none
}

//CapabilitiesNew Command (17)
export interface VM_CapabilitiesNewRequest
{
    //none
}

export interface VM_CapabilitiesNewReply
{
    canWatchFieldModification : boolean;
    canWatchFieldAccess : boolean;
    canGetBytecodes : boolean;
    canGetSyntheticAttribute : boolean;
    canGetOwnedMonitorInfo : boolean;
    canGetCurrentContendedMonitor : boolean;
    canGetMonitorInfo : boolean;
    canRedefineClasses : boolean;
    canAddMethod : boolean;
    canUnrestrictedlyRedefineClasses : boolean;
    canPopFrames : boolean;
    canUseInstanceFilters : boolean;
    canGetSourceDebugExtension : boolean;
    canRequestVMDeathEvent : boolean;
    canSetDefaultStratum : boolean;
    canGetInstanceInfo : boolean;
    canRequestMonitorEvents : boolean;
    canGetMonitorFrameInfo : boolean;
    canUseSourceNameFilters : boolean;
    canGetConstantPool : boolean;
    canForceEarlyReturn : boolean;
    reserved22 : boolean;
    reserved23 : boolean;
    reserved24 : boolean;
    reserved25 : boolean;
    reserved26 : boolean;
    reserved27 : boolean;
    reserved28 : boolean;
    reserved29 : boolean;
    reserved30 : boolean;
    reserved31 : boolean;
    reserved32 : boolean;
}

//RedefineClasses Command (18)
export interface VM_RedefineClassesRequest
{
    classes : number;
    refType : referenceTypeID[];
    classbyte : Buffer[];
}

export interface VM_RedefineClassesReply
{
    //none
}

//SetDefaultStratum Command (19)
export interface VM_SetDefaultStratumRequest
{
    stratumID : string;
}

export interface VM_SetDefaultStratumReply
{
    //none
}

//AllClassesWithGeneric Command (20)
export interface VM_AllClassesWithGenericRequest
{
    //none
}

export interface VM_AllClassesWithGenericReply
{
    classes : number;
    refTypeTag : JdwpTypeTag[];
    typeID : referenceTypeID[];
    signature : string[];
    genericSignature : string[];
    status : number[];
}

//InstanceCounts Command (21)
export interface VM_InstanceCountsRequest
{
    refTypes : referenceTypeID[];
}

export interface VM_InstanceCountsReply
{
    instanceCount : bigint[];
}

/**
*ReferenceType Command Set (2)
**/
//Signature Command (1)
export interface RT_SignatureRequest
{
    refType : referenceTypeID;
}

export interface RT_SignatureReply
{
    signature : string;
}

//ClassLoader Command (2)
export interface RT_ClassLoaderRequest
{
    refType : referenceTypeID;
}

export interface RT_ClassLoaderReply
{
    classLoader : classLoaderID;
}

//Modifiers Command (3)
export interface RT_ModifiersRequest
{
    refType : referenceTypeID;
}

export interface RT_ModifiersReply
{
    modBits : number;
}

//Fields Command (4)
export interface RT_FieldsRequest
{
    refType : referenceTypeID;
}

export interface RT_FieldsReply
{
    declared : number;
    fieldId : fieldID[];
    name : string[];
    signature : string[];
    modBits : number[];
}

//Methods Command (5)
export interface RT_MethodsRequest
{
    refType : referenceTypeID;
}

export interface RT_MethodsReply
{
    declared : number;
    methodId : methodID[];
    name : string[];
    signature : string[];
    modBits : number[];
}

//GetValues Command (6)
export interface RT_GetValuesRequest
{
    refType : referenceTypeID;
    fieldIds : fieldID[];
}

export interface RT_GetValuesReply
{
    values : javaValue[];
}

//SourceFile Command (7)
export interface RT_SourceFileRequest
{
    refType : referenceTypeID;
}

export interface RT_SourceFileReply
{
    sourceFile : string;
}

//NestedTypes Command (8)
export interface RT_NestedTypesRequest
{
    refType : referenceTypeID;
}

export interface RT_NestedTypesReply
{
    classes : number;
    refTypeTags : JdwpTypeTag[];
    typeIDs : referenceTypeID[];
}

//Status Command (9)
export interface RT_StatusRequest
{
    refType : referenceTypeID;
}

export interface RT_StatusReply
{
    status : JdwpClassStatus;
}

//Interfaces Command (10)
export interface RT_InterfacesRequest
{
    refType : referenceTypeID;
}

export interface RT_InterfacesReply
{
    interfaceTypes : interfaceID[];
}

//ClassObject Command (11)
export interface RT_ClassObjectRequest
{
    refType : referenceTypeID;
}

export interface RT_ClassObjectReply
{
    classObject : classObjectID;
}

//SourceDebugExtension Command (12)
export interface RT_SourceDebugExtensionRequest
{
    refType : referenceTypeID;
}

export interface RT_SourceDebugExtensionReply
{
    extension : string;
}

//SignatureWithGeneric Command (13)
export interface RT_SignatureWithGenericRequest
{
    refType : referenceTypeID;
}

export interface RT_SignatureWithGenericReply
{
    signature : string;
    genericSignature : string;
}

//FieldsWithGeneric Command (14)
export interface RT_FieldsWithGenericRequest
{
    refType : referenceTypeID;
}

export interface RT_FieldsWithGenericReply
{
    declared : number;
    fieldIDs : fieldID[];
    names : string[];
    signatures : string[];
    genericSignature : string[];
    modBits : number[];
}

//MethodsWithGeneric Command (15)
export interface RT_MethodsWithGenericRequest
{
    refType : referenceTypeID;
}

export interface RT_MethodsWithGenericReply
{
    declared : number;
    methodIDs : methodID[];
    names : string[];
    signatures : string[];
    genericSignatures : string[];
    modBits : number[];
}

//Instances Command (16)
export interface RT_InstancesRequest
{
    refType : referenceTypeID;
    maxInstances : number;
}

export interface RT_InstancesReply
{
    instances : taggedObjectID[];
}

//ClassFileVersion Command (17)
export interface RT_ClassFileVersionRequest
{
    refType : referenceTypeID;
}

export interface RT_ClassFileVersionReply
{
    majorVersion : number;
    minorVersion : number;
}

//ConstantPool Command (18)
export interface RT_ConstantPoolRequest
{
    refType : referenceTypeID;
}

export interface RT_ConstantPoolReply
{
    count : number;
    cpbytes : Buffer;
}

/**
 * ClassType Command Set (3)
 **/
//Superclass Command (1)
export interface CT_SuperclassRequest
{
    clazz : classID;
}

export interface CT_SuperclassReply
{
    superclass : classID;
}

//SetValues Command (2)
export interface CT_SetValuesRequest
{
    clazz : classID;
    count : number;
    fieldIds : fieldID[];
    values : javaUntaggedValue[];
}

export interface CT_SetValuesReply
{
    //none
}

//InvokeMethod Command (3)
export interface CT_InvokeMethodRequest
{
    clazz : classID;
    thread : threadID;
    methodId : methodID;
    args : javaValue[];
    options : number;
}

export interface CT_InvokeMethodReply
{
    returnValue : javaValue;
    exception : taggedObjectID;
}

//NewInstance Command (4)
export interface CT_NewInstanceRequest
{
    clazz : classID;
    thread : threadID;
    methodId : methodID;
    args : javaValue[];
    options : number;
}

export interface CT_NewInstanceReply
{
    newObject : taggedObjectID;
    exception : taggedObjectID;
}

/**
 * ArrayType Command Set (4)
 **/
//NewInstance Command (1)
export interface AT_NewInstanceRequest
{
    arrType : arrayTypeID;
    length : number;
}

export interface AT_NewInstanceReply
{
    newArray : taggedObjectID;
}

/**
 * InterfaceType Command Set (5)
 **/
//none

/**
 * Method Command Set (6)
 **/
//LineTable Command (1)
export interface M_LineTableRequest
{
    refType : referenceTypeID;
    methodId : methodID;
}

export interface M_LineTableReply
{
    start : bigint;
    end : bigint;
    lines : number;
    lineCodeIndexs : bigint[];
    lineNumbers : number[];
}

//VariableTable Command (2)
export interface M_VariableTableRequest
{
    refType : referenceTypeID;
    methodId : methodID;
}

export interface M_VariableTableReply
{
    argCnt : number;
    count : number;
    codeIndexs : bigint[];
    names : string[];
    signatures : string[];
    lengths : number[];
    slots : number[];
}

//Bytecodes Command (3)
export interface M_BytecodesRequest
{
    refType : referenceTypeID;
    methodId : methodID;
}

export interface M_BytecodesReply
{
    bytecodes : Buffer;
}

//IsObsolete Command (4)
export interface M_IsObsoleteRequest
{
    refType : referenceTypeID;
    methodId : methodID;
}

export interface M_IsObsoleteReply
{
    isObsolete : boolean;
}

//VariableTableWithGeneric Command (5)
export interface M_VariableTableWithGenericRequest
{
    refType : referenceTypeID;
    methodId : methodID;
}

export interface M_VariableTableWithGenericReply
{
    argCnt : number;
    count : number;
    codeIndexs : bigint[];
    names : string[];
    signatures : string[];
    genericSignatures : string[];
    lengths : number[];
    slots : number[];
}

/**
 * Field Command Set (8)
 **/
//none

/**
 * ObjectReference Command Set (9)
 **/
//ReferenceType Command (1)
export interface OR_ReferenceTypeRequest
{
    object : objectID;
}

export interface OR_ReferenceTypeReply
{
    refTypeTag : JdwpTypeTag;
    typeID : referenceTypeID;
}

//GetValues Command (2)
export interface OR_GetValuesRequest
{
    object : objectID;
    fieldIds : 	fieldID[];
}

export interface OR_GetValuesReply
{
    values : javaValue[];
}

//SetValues Command (3)
export interface OR_SetValuesRequest
{
    object : objectID;
    count : number;
    fieldIds : fieldID[];
    values : javaUntaggedValue[];
}

export interface OR_SetValuesReply
{
    //none
}

//MonitorInfo Command (5)
export interface OR_MonitorInfoRequest
{
    object : objectID;
}

export interface OR_MonitorInfoReply
{
    owner : threadID;
    entryCount : number;
    threads : threadID[];
}

//InvokeMethod Command (6)
export interface OR_InvokeMethodRequest
{
    object : objectID;
    thread : threadID;
    clazz : classID;
    methodId : methodID;
    args : javaValue[];
    options : number;
}

export interface OR_InvokeMethodReply
{
    returnValue : javaValue;
    exception : taggedObjectID;
}

//DisableCollection Command (7)
export interface OR_DisableCollectionRequest
{
    object : objectID;
}

export interface OR_DisableCollectionReply
{
    //none
}

//EnableCollection Command (8)
export interface OR_EnableCollectionRequest
{
    object : objectID;
}

export interface OR_EnableCollectionReply
{
    //none
}

//IsCollected Command (9)
export interface OR_IsCollectedRequest
{
    object : objectID;
}

export interface OR_IsCollectedReply
{
    isCollected : boolean;
}

//ReferringObjects Command (10)
export interface OR_ReferringObjectsRequest
{
    object : objectID;
    maxReferrers : number;
}

export interface OR_ReferringObjectsReply
{
    instances : taggedObjectID[];
}

/**
 * StringReference Command Set (10)
 **/
//Value Command (1)
export interface SR_ValueRequest
{
    stringObject : objectID;
}

export interface SR_ValueReply
{
    stringValue : string;
}

/**
 * ThreadReference Command Set (11)
 **/
//Name Command (1)
export interface TR_NameRequest
{
    thread : threadID;
}

export interface TR_NameReply
{
    threadName : string;
}

//Suspend Command (2)
export interface TR_SuspendRequest
{
    thread : threadID;
}

export interface TR_SuspendReply
{
    //none
}

//Resume Command (3)
export interface TR_ResumeRequest
{
    thread : threadID;
}

export interface TR_ResumeReply
{
    //none
}

//Status Command (4)
export interface TR_StatusRequest
{
    thread : threadID;
}

export interface TR_StatusReply
{
    threadStatus : number;
    suspendStatus : number;
}

//ThreadGroup Command (5)
export interface TR_ThreadGroupRequest
{
    thread : threadID;
}

export interface TR_ThreadGroupReply
{
    group : threadGroupID;
}

//Frames Command (6)
export interface TR_FramesRequest
{
    thread : threadID;
    startFrame : number;
    length : number;
}

export interface TR_FramesReply
{
    frames : number;
    frameIds : frameID[];
    locations : javaLocation[];
}

//FrameCount Command (7)
export interface TR_FrameCountRequest
{
    thread : threadID;
}

export interface TR_FrameCountReply
{
    frameCount : number;
}

//OwnedMonitors Command (8)
export interface TR_OwnedMonitorsRequest
{
    thread : threadID;
}

export interface TR_OwnedMonitorsReply
{
    monitors : taggedObjectID[];
}

//CurrentContendedMonitor Command (9)
export interface TR_CurrentContendedMonitorRequest
{
    thread : threadID;
}

export interface TR_CurrentContendedMonitorReply
{
    monitor : taggedObjectID;
}

//Stop Command (10)
export interface TR_StopRequest
{
    thread : threadID;
    throwable : objectID;
}

export interface TR_StopReply
{
    //none
}

//Interrupt Command (11)
export interface TR_InterruptRequest
{
    thread : threadID;
}

export interface TR_InterruptReply
{
    //none
}

//SuspendCount Command (12)
export interface TR_SuspendCountRequest
{
    thread : threadID;
}

export interface TR_SuspendCountReply
{
    suspendCount : number;
}

//OwnedMonitorsStackDepthInfo Command (13)
export interface TR_OwnedMonitorsStackDepthInfoRequest
{
    thread : threadID;
}

export interface TR_OwnedMonitorsStackDepthInfoReply
{
    owned : number;
    monitors : taggedObjectID[];
    stack_depths : number[];
}

//ForceEarlyReturn Command (14)
export interface TR_ForceEarlyReturnRequest
{
    thread : threadID;
    value : javaValue;
}

export interface TR_ForceEarlyReturnReply
{
    //none
}

/**
 * ThreadGroupReference Command Set (12)
 **/
//Name Command (1)
export interface TGR_NameRequest
{
    group : threadGroupID;
}

export interface TGR_NameReply
{
    groupName : string;
}

//Parent Command (2)
export interface TGR_ParentRequest
{
    group : threadGroupID;
}

export interface TGR_ParentReply
{
    parentGroup : threadGroupID;
}

//Children Command (3)
export interface TGR_ChildrenRequest
{
    group : threadGroupID;
}

export interface TGR_ChildrenReply
{
    childThreads : threadID[];
    childGroups : threadGroupID[];
}

/**
 * ArrayReference Command Set (13)
 **/
//Length Command (1)
export interface AR_LengthRequest
{
    arrayObject : arrayID;
}

export interface AR_LengthReply
{
    arrayLength : number;
}

//GetValues Command (2)
export interface AR_GetValuesRequest
{
    arrayObject : arrayID;
    firstIndex : number;
    length : number;
}

export interface AR_GetValuesReply
{
    values : javaArrayregion;
}

//SetValues Command (3)
export interface AR_SetValuesRequest
{
    arrayObject : arrayID;
    firstIndex : number;
    values : javaUntaggedValue[];
}

export interface AR_SetValuesReply
{
    //none
}

/**
 * ClassLoaderReference Command Set (14)
 **/
//VisibleClasses Command (1)
export interface CLR_VisibleClassesRequest
{
    classLoaderObject : classLoaderID;
}

export interface CLR_VisibleClassesReply
{
    classes : number;
    refTypeTags : JdwpTypeTag[];
    typeIds : referenceTypeID[];
}

/**
 * EventRequest Command Set (15)
 **/
//Set Command (1)
export interface JavaModifier
{
    modKind : JdwpModKind;
    count? : number;
    exprID? : number;
    thread? : threadID;
    clazz? : referenceTypeID;
    classPattern? : string;
    loc? : javaLocation;
    exceptionOrNull? : referenceTypeID;
    caught? : boolean;
    uncaught? : boolean;
    declaring? : referenceTypeID;
    size? : JdwpStepSize;
    depth? : JdwpStepDepth;
    instance? : objectID;
    sourceNamePattern? : string;
}

export interface ER_SetRequest
{
    eventKind : JdwpEventKind;
    suspendPolicy : JdwpSuspendPolicy;
    modifiers : JavaModifier[];
}

export interface ER_SetReply
{
    requestID : number;
}

//Clear Command (2)
export interface ER_ClearRequest
{
    eventKind : JdwpEventKind;
    requestID : number;
}

export interface ER_ClearReply
{
    //none
}

//ClearAllBreakpoints Command (3)
export interface ER_ClearAllBreakpointsRequest
{
    //none
}

export interface ER_ClearAllBreakpointsReply
{
    //none
}

/**
 * StackFrame Command Set (16)
 **/
//GetValues Command (1)
export interface SF_GetValuesRequest
{
    thread : threadID;
    frame : frameID;
    count : number;
    slots : number[];
    sigbytes : JdwpType[];
}

export interface SF_GetValuesReply
{
    slotValues : javaValue[];
}

//SetValues Command (2)
export interface SF_SetValuesRequest
{
    thread : threadID;
    frame : frameID;
    count : number;
    slots : number[];
    slotValues : javaValue[];
}

export interface SF_SetValuesReply
{
    //none
}

//ThisObject Command (3)
export interface SF_ThisObjectRequest
{
    thread : threadID;
    frame : frameID;
}

export interface SF_ThisObjectReply
{
    objectThis : taggedObjectID;
}

//PopFrames Command (4)
export interface SF_PopFramesRequest
{
    thread : threadID;
    frame : frameID;
}

export interface SF_PopFramesReply
{
    //none
}

/**
 * ClassObjectReference Command Set (17)
 **/
//ReflectedType Command (1)
export interface COR_ReflectedTypeRequest
{
    classObject : classObjectID;
}

export interface COR_ReflectedTypeReply
{
    refTypeTag : JdwpTypeTag;
    typeID : referenceTypeID;
}

/**
 * Event Command Set (64)
 **/
//Composite Command (100)
export interface JavaEvent
{
    eventKind : JdwpEventKind;
    requestID : number;
    //
    thread? : threadID;
    location? : javaLocation;
    value? : javaValue;
    object? : taggedObjectID;
    timeout? : bigint;
    timed_out? : boolean;
    exception? : taggedObjectID;
    refTypeTag? : JdwpTypeTag;
    typeID? : referenceTypeID;
    signature? : string;
    status? : number;
    fieldId? : fieldID;
}

export interface E_CompositeNotify
{
    suspendPolicy : JdwpSuspendPolicy;
    events : JavaEvent[];
}
