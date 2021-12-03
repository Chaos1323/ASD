import * as os from 'os';
import * as path from 'path';
import { Handles, ClassInfo, DebugBreakPoint, MethodInfo, SmaliLaunchArguments, 
	JavaFrame, DebugVariable, SmaliLineInfo, SmaliLocalReg } from './interfaces_classes'
import {
	InitializedEvent,
	logger,
	Logger,
	LoggingDebugSession,
	OutputEvent,
	Scope,
	Source,
	StackFrame,
	StoppedEvent,
	ThreadEvent,
	BreakpointEvent,
	TerminatedEvent,
	Thread,
	Breakpoint,
	Variable,
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { JDWPClient } from './JDWPClient';
import { convertStringType, formatClsNameFromPath, formatStringValue, isPrimitiveType, log, logError } from './utils';
import { arrayID, fieldID, frameID, frameIDSize, javaUntaggedValue, javaValue, methodID, objectID, 
	referenceTypeID, setIDSizes, threadID } from './buffer';
import { JdwpEventKind, JdwpModKind, JdwpStepDepth, JdwpStepSize, JdwpSuspendPolicy, 
	JdwpType, JdwpTypeTag } from './JDWPConstants';
import { AR_GetValuesReply, AR_LengthReply, ER_ClearRequest, ER_SetReply, ER_SetRequest, 
	JavaEvent, JavaModifier, OR_ReferenceTypeReply, RT_FieldsReply, RT_MethodsReply, 
	SF_GetValuesReply, TR_FramesReply, TR_NameReply, VM_AllClassesWithGenericReply, 
	VM_AllThreadsReply, VM_IDSizesReply } from './JDWPProtocol';
import { AdbClient } from './AdbClient';
import { BreakpointStatus } from './enums';
import { ThreadFrameManager } from './threadFrame';
import { SmaliParser } from './SmaliParser';

export class ASDebugSession extends LoggingDebugSession
{
	protected cwd : string;
	protected client : JDWPClient;
	protected smali : SmaliParser;
	private logCategory : Logger.LogLevel = Logger.LogLevel.Error;
	private threadHandles : Handles<threadID>;
	private threadInfos : Thread[];
	private allclasses_signature : { [key: string]: ClassInfo };
	private allcalsses_id : Map<referenceTypeID, ClassInfo>;
	private breakpoints : { [key: string]: DebugBreakPoint[] };
	private frameMgr : ThreadFrameManager;

	public constructor()
	{
		super();
		this.cwd = "";
		this.client = new JDWPClient(13131);
		this.smali = new SmaliParser();
		this.frameMgr = new ThreadFrameManager();
		this.threadHandles = new Handles<threadID>();
		this.threadInfos = [];
		this.allclasses_signature = {};
		this.allcalsses_id = new Map();
		this.breakpoints = {};

		this.client.on("javaEvent", e => this.handleJavaEvent(e));
	}

	private getThreadVSId(thread : threadID) : number
	{
		for (let i = 0; i < this.threadInfos.length; i++)
		{
			let thd : threadID | undefined = this.threadHandles.get(this.threadInfos[i].id);
			if (thd == thread)
			{
				return this.threadInfos[i].id;
			}
		}

		//create first
		let vsid : number = this.threadHandles.create(thread);
		let tmpthd : Thread = new Thread(vsid, "name-getting");
		this.threadInfos.push(tmpthd);

		//set name
		this.client.TR_Name({
			"thread" : thread,
		}).then((reply) => {
			if (reply) {
				tmpthd.name = reply.threadName;
			}
		}).catch((error) => {
			logError("getThreadVSId", "get thread name failed.");
		});

		return vsid;
	}

	protected handleJavaEvent(events : JavaEvent[]) : void
	{
		for (let i = 0; i < events.length; i++)
		{
			let thread : threadID | undefined = events[i].thread;
			switch (events[i].eventKind)
			{
				case JdwpEventKind.EK_SINGLE_STEP:
					if (thread)
					{
						this.sendEvent(new StoppedEvent('step', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_BREAKPOINT:
					if (thread)
					{
						this.sendEvent(new StoppedEvent('breakpoint', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_THREAD_START:
					if (thread) {
						this.sendEvent(new ThreadEvent('started', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_THREAD_END:
					if (thread) {
						this.sendEvent(new ThreadEvent('exited', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_CLASS_PREPARE:
					let signature : string | undefined = events[i].signature;
					let tag : JdwpTypeTag | undefined = events[i].refTypeTag;
					let refTypeId : referenceTypeID | undefined = events[i].typeID;
					let status : number | undefined = events[i].status;
					if (signature && tag && refTypeId && status)
					{
						let cls : ClassInfo = new ClassInfo(signature,
							tag, refTypeId, status);
						this.allclasses_signature[signature] = cls;
						this.allcalsses_id.set(refTypeId, cls);

						//add breakpoints
						let bps: DebugBreakPoint[] = this.breakpoints[signature];
						for (let i = 0; bps && i < bps.length; i++) {
							this.addSingleBreakPoint(cls, bps[i]).then((bp) => {
								this.sendEvent(new BreakpointEvent('changed', bp))
							});
						}
					}
					break;
				case JdwpEventKind.EK_METHOD_ENTRY:
					if (thread)
					{
						this.sendEvent(new StoppedEvent('method enter', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_METHOD_EXIT:
					if (thread)
					{
						this.sendEvent(new StoppedEvent('method exit', this.getThreadVSId(thread)));
					}
					break;
				case JdwpEventKind.EK_VM_DEATH:
					this.sendEvent(new TerminatedEvent(false));
					break;
				case JdwpEventKind.EK_VM_DISCONNECTED:
					this.sendEvent(new TerminatedEvent(false));
					break;
				case JdwpEventKind.EK_CLASS_UNLOAD:
					break;
				default:
					break;
			}
		}
	}

	public errorResponse(response: DebugProtocol.Response, message: string) {
		response.success = false;
		response.message = message;
		logError(message);
		this.sendResponse(response);
	}

	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void
	{
		log("InitializeRequest", args);
		response.body = response.body || {};
		//just support hit count breakpoint,configuration Done, hover evaluate, set variable and restart top frame functions

		//support hit conditional breakpoints.
		response.body.supportsHitConditionalBreakpoints = true;
		//implements the 'configurationDone' request.
		response.body.supportsConfigurationDoneRequest = true;
		//support hovers based on the 'evaluate' request.
		response.body.supportsEvaluateForHovers = true;
		//support the 'setVariable' request.
		response.body.supportsSetVariable = true;
		//support the 'restartFrame' request.
		response.body.supportsRestartFrame = true;

		this.sendResponse(response);

		this.frameMgr.reset();
		log("InitializeResponse", response);
	}

	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): Promise<void>
	{
		//close the jdwp connection
		log("DisconnectRequest", args);
		await this.client.stop();
		super.disconnectRequest(response, args);
		log("DisconnectResponse", response);
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: SmaliLaunchArguments & DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request): Promise<void>
	{
		log("LaunchRequest", args);

		//check parameters
		if (!args.workDir)
		{
			this.sendErrorResponse(
				response,
				2000,
				'Failed to continue: The workDir attribute is missing in the debug configuration in launch.json'
			);
			return;
		}

		if (!args.packageName)
		{
			this.sendErrorResponse(
				response,
				2000,
				'Failed to continue: The packageName attribute is missing in the debug configuration in launch.json'
			);
			return;
		}

		if (!args.mainActivity)
		{
			this.sendErrorResponse(
				response,
				2000,
				'Failed to continue: The mainActivity attribute is missing in the debug configuration in launch.json'
			);
			return;
		}

		if (!args.deviceId)
		{
			this.sendErrorResponse(
				response,
				3000,
				'Failed to continue: The deviceId attribute is missing in the debug configuration in launch.json'
			);
			return;
		}

		this.logCategory =
			args.trace === 'verbose' || args.trace === 'trace'
				? Logger.LogLevel.Verbose
				: args.trace === 'log' || args.trace === 'info' || args.trace === 'warn'
				? Logger.LogLevel.Log
				: Logger.LogLevel.Error;

		const logPath = args.logFile?args.logFile:path.join(os.tmpdir(), 'Smali-debug.log');
		logger.setup(this.logCategory, logPath);

		//set current project dir
		this.cwd = args.workDir;
		if (this.cwd[this.cwd.length - 1] != path.sep) {
			this.cwd += path.sep;
		}

		if (-1 != os.type().indexOf("Windows")) {
			this.cwd = this.cwd[0].toLowerCase() + this.cwd.slice(1);
		}

		//get the target pid
		AdbClient.setTargetDevice(args.deviceId);
		let pid : string = await AdbClient.getProcessIdByName(args.packageName);
		if ("" == pid)
		{
			pid = await AdbClient.launchApp(args.packageName, args.mainActivity);
			if ("" == pid) {
				this.sendErrorResponse(
					response,
					2001,
					'Failed to continue: launch the application failed'
				);

				return;
			}
		}

		//forward jdwp
		await AdbClient.forwardJdwp(pid);

		//connect to the vmserver
		this.client.start().then(
			async() => {
				//get version
				await this.client.VM_Version();

				//suspend vm
				await this.client.VM_Suspend();

				//get id size 
				let idSizes : VM_IDSizesReply | undefined = await this.client.VM_IDSizes();
				if (!idSizes) {
					logError("Get VM IDSizes failed.");
					this.errorResponse(response, "Get VM IDSizes failed.");
					this.sendEvent(new TerminatedEvent());
					return ;
				}

				setIDSizes(idSizes.fieldIDSize, idSizes.methodIDSize, idSizes.objectIDSize,
					idSizes.referenceTypeIDSize, idSizes.frameIDSize);

				//get capabilities
				await this.client.VM_CapabilitiesNew();

				//set default event
				await this.client.ER_Set({
					"eventKind" : JdwpEventKind.EK_CLASS_PREPARE,
					"suspendPolicy" : JdwpSuspendPolicy.SP_NONE,
					"modifiers" : [],
				});

				await this.client.ER_Set({
					"eventKind" : JdwpEventKind.EK_THREAD_START,
					"suspendPolicy" : JdwpSuspendPolicy.SP_NONE,
					"modifiers" : [],
				});

				await this.client.ER_Set({
					"eventKind" : JdwpEventKind.EK_THREAD_END,
					"suspendPolicy" : JdwpSuspendPolicy.SP_NONE,
					"modifiers" : [],
				});

				await this.client.ER_Set({
					"eventKind" : JdwpEventKind.EK_VM_DEATH,
					"suspendPolicy" : JdwpSuspendPolicy.SP_NONE,
					"modifiers" : [],
				});

				await this.client.ER_Set({
					"eventKind" : JdwpEventKind.EK_VM_DISCONNECTED,
					"suspendPolicy" : JdwpSuspendPolicy.SP_NONE,
					"modifiers" : [],
				});

				//get all classes
				let classes : VM_AllClassesWithGenericReply | undefined = await this.client.VM_AllClassesWithGeneric();
				if (classes)
				{
					for (let i = 0; i < classes.classes; i++)
					{
						let cls : ClassInfo = new ClassInfo(classes.signature[i],
							classes.refTypeTag[i], classes.typeID[i], classes.status[i]);
						this.allclasses_signature[classes.signature[i]] = cls;
						this.allcalsses_id.set(classes.typeID[i], cls);
					}
				}

				//resume vm
				this.client.VM_Resume();

				this.sendEvent(new InitializedEvent());
				this.sendResponse(response);
			},
			(error) => {
				this.errorResponse(response, `${error}`);
				this.sendEvent(new TerminatedEvent());
			}
		);

		log("LaunchResponse", response);
	}

	//relate to the capability supportsConfigurationDoneRequest
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request): void
	{
		log("ConfigurationDoneRequest", args);
		this.sendResponse(response);
		log("ConfigurationDoneResponse", response);
	}

	private async getMethodFromName(mthName : string, cls : ClassInfo) : Promise<MethodInfo | undefined>
	{
		//get all methods of the class
		if (0 == cls.GetMethodSize())
		{
			let methods : RT_MethodsReply | undefined = await this.client.RT_Methods({
				"refType": cls.typeID,
			});

			if (methods) {
				cls.AddMethods(methods.name, methods.signature, methods.methodId, methods.modBits);
			}
		}

		//get the method
		let mth : MethodInfo | undefined = cls.getMethodFromProtoType(mthName);
		if (!mth)
		{
			logError("getMethodFromName", `cannot get method from methodId ${mthName}.`);
		}

		return mth;
	}

	private async getMethodFromId(id : methodID, cls : ClassInfo) : Promise<MethodInfo | undefined>
	{
		//get all methods of the class
		if (0 == cls.GetMethodSize())
		{
			let methods : RT_MethodsReply | undefined = await this.client.RT_Methods({
				"refType": cls.typeID,
			});

			if (methods) {
				cls.AddMethods(methods.name, methods.signature, methods.methodId, methods.modBits);
			}
		}

		//get the method
		let mth : MethodInfo | undefined = cls.getMethodFromMethodId(id);
		if (!mth)
		{
			logError("getMethodFromId", `cannot get method from methodId ${id}.`);
		}

		return mth;
	}

	protected async addSingleBreakPoint(cls : ClassInfo | undefined, breakpoint : DebugBreakPoint): Promise<DebugProtocol.Breakpoint>
	{
		let reply: ER_SetReply | undefined = undefined;
		if (cls && "" != breakpoint.methodName) {
			breakpoint.status = BreakpointStatus.BS_SETTING;
			//get classid and methid
			let mth : MethodInfo | undefined = await this.getMethodFromName(breakpoint.methodName, cls);
			if (mth) {
				//set event
				let modifiers: JavaModifier[] = [];
				modifiers.push({
					"modKind": JdwpModKind.MK_LOCATION_ONLY,
					"loc": {
						"tag": JdwpTypeTag.TT_CLASS,
						"classId": cls.typeID,
						"methodId": mth.methodID,
						"index": breakpoint.offset,
					},
				});

				if (0 != breakpoint.hitCount) {
					modifiers.push({
						"modKind": JdwpModKind.MK_COUNT,
						"count": breakpoint.hitCount,
					});
				}
				reply = await this.client.ER_Set({
					"eventKind": JdwpEventKind.EK_BREAKPOINT,
					"suspendPolicy": JdwpSuspendPolicy.SP_EVENT_THREAD,
					"modifiers": modifiers,
				});
			}

			breakpoint.status = BreakpointStatus.BS_UNSET;
			if (reply) {
				breakpoint.requestId = reply.requestID;
				breakpoint.status = BreakpointStatus.BS_SET;
			}
		}

		return {
			"id" : breakpoint.line,
			"verified" : reply?true:false,
			"line" : breakpoint.line,
			"source" : new Source(breakpoint.file.slice(breakpoint.file.lastIndexOf(path.sep) + 1), breakpoint.file),
		};
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): Promise<void>
	{
		log("SetBreakPointsRequest", args);
		const file : string | undefined = args.source.path?args.source.path:args.source.name;
		if (!file || -1 == file.indexOf(this.cwd))
		{
			this.errorResponse(response, "setBreakPointsRequest:the source file is undefined or relative.");
			return ;
		}

		let addBps : DebugBreakPoint[] = [];
		let breakpoints : DebugProtocol.Breakpoint[] = [];
		let clsName : string = formatClsNameFromPath(this.cwd, file);

		if (args.breakpoints) {
			args.breakpoints.map((breakpoint) => {
				addBps.push({
					"file" : file,
					"clsName" : clsName,
					"hitCount" : parseInt(breakpoint.hitCondition?breakpoint.hitCondition:"0"),
					"line" : breakpoint.line,
					"methodName" : "",
					"offset" : BigInt(0),
					"requestId" : 0,
					"status" : BreakpointStatus.BS_UNSET,
				});
			});
		}

		let cls : ClassInfo | undefined = this.allclasses_signature[clsName];
		let curBps : DebugBreakPoint[] = this.breakpoints[clsName];
		if (cls && curBps)
		{
			for (let i = 0; i < curBps.length; i++) {
				let index: number = 0;
				let exist: boolean = false;
				for (; index < addBps.length; index++) {
					if (curBps[i].line == addBps[index].line) {
						//if same, keep stay
						if (curBps[i].hitCount != addBps[index].hitCount) {
							if (BreakpointStatus.BS_SET == curBps[i].status) {
								await this.client.ER_Clear({
									"eventKind": JdwpEventKind.EK_BREAKPOINT,
									"requestID": curBps[i].requestId,
								});
							}

							curBps[i].hitCount = addBps[index].hitCount;
							breakpoints.push(await this.addSingleBreakPoint(cls, curBps[i]));
						}

						exist = BreakpointStatus.BS_SET == curBps[i].status?true:false;
						addBps.splice(index);
					}
				}

				if (!exist) {
					let reason : string = "new";
					//if unset
					if (BreakpointStatus.BS_UNSET == curBps[i].status)
					{
						await this.addSingleBreakPoint(cls, curBps[i]);
					}
					else{
						reason = "removed";
						await this.client.ER_Clear({
							"eventKind": JdwpEventKind.EK_BREAKPOINT,
							"requestID": curBps[i].requestId,
						});
					}

					this.sendEvent(new BreakpointEvent(reason,
						new Breakpoint(false, curBps[i].line, 0, new Source(args.source.name ? args.source.name : file, curBps[i].file))));

					//delete bp for list
					curBps.splice(i--);
				}
			}

			curBps = curBps.concat(addBps);
		}

		for (let i = 0; i < addBps.length; i++)
		{
			let lineInfo : SmaliLineInfo | undefined = this.smali.getLineInfoByLine(file, addBps[i].line);
			if (lineInfo)
			{
				addBps[i].methodName = lineInfo.mth;
				addBps[i].offset = lineInfo.offset;
			}

			breakpoints.push(await this.addSingleBreakPoint(cls, addBps[i]));
		}

		if (!curBps)
		{
			this.breakpoints[clsName] = addBps;
		}
		
		response.body = { breakpoints };
		this.sendResponse(response);
		log("SetBreakPointsResponse", response);
	}

	protected async threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): Promise<void>
	{
		log("ThreadsRequest");
		if (0 == this.threadInfos.length)
		{
			//get threads
			let threadReplys: VM_AllThreadsReply | undefined = await this.client.VM_AllThreads();
			if (threadReplys) {
				const nameReplys: Promise<TR_NameReply | undefined>[] = [];
				for (let i = 0; i < threadReplys.thread.length; i++) {
					nameReplys.push(this.client.TR_Name({"thread" : threadReplys.thread[i]}));
				}

				for (let i = 0; i < threadReplys.thread.length; i++) {
					let vsid : number = this.threadHandles.create(threadReplys.thread[i]);
					let name : TR_NameReply | undefined = await nameReplys[i];
					this.threadInfos.push(new Thread(vsid, name?name.threadName:""));
				}
			}
		}

		response.body = {"threads" : this.threadInfos};
		this.sendResponse(response);
		log("ThreadsResponse", response);
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request): void
	{
		log("PauseRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.client.TR_Suspend({
			"thread" : thread,
		}).then(() => {
			this.sendResponse(response);
			this.sendEvent(new StoppedEvent('pause', args.threadId));
		}).catch((error) => this.errorResponse(response, `${error}`));
		log("PauseResponse", response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request): void
	{
		log("ContinueRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.client.TR_Resume({
			"thread" : thread,
		}).then(() => {
			response.body = { allThreadsContinued : false };
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));

		this.frameMgr.removeThreadFrames(args.threadId);
		log("ContinueResponse", response);
	}

	private async doStep(stepDepth : JdwpStepDepth, thread : threadID) : Promise<void>
	{
		let stepmod: JavaModifier = {
			"modKind" : JdwpModKind.MK_STEP,
			"thread" : thread,
			"size" : JdwpStepSize.SS_MIN,
			"depth" : stepDepth,
		};

		let mods: JavaModifier[] = [stepmod];
		await this.client.ER_Set({
			"eventKind" : JdwpEventKind.EK_SINGLE_STEP,
			"suspendPolicy" : JdwpSuspendPolicy.SP_EVENT_THREAD,
			"modifiers" : mods,
		});

		await this.client.TR_Resume({
			"thread": thread,
		});
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request): void
	{
		log("NextRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.doStep(JdwpStepDepth.SD_OVER, thread).then(() => {
			this.frameMgr.removeThreadFrames(args.threadId);
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));
		log("NextResponse", response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request): void
	{
		log("StepInRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.doStep(JdwpStepDepth.SD_INTO, thread).then(() => {
			this.frameMgr.removeThreadFrames(args.threadId);
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));
		log("StepInResponse", response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request): void
	{
		log("StepOutRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		this.doStep(JdwpStepDepth.SD_OUT, thread).then(() => {
			this.frameMgr.removeThreadFrames(args.threadId);
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));
		log("StepOutResponse", response);
	}

	private async popFrameAndResume(thread : threadID, 	frame : frameID) : Promise<void>
	{
		await this.client.SF_PopFrames({
			"frame" : frame,
			"thread" : thread,
		});

		await this.client.TR_Resume({
			"thread" : thread,
		});
	}

	protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments, request?: DebugProtocol.Request): void
	{
		log("RestartFrameRequest", args);
		let frame : JavaFrame | undefined = this.frameMgr.getFrameFromId(args.frameId);
		if (!frame)
		{
			this.errorResponse(response, `No frame with id ${args.frameId}`);
			return;
		}
		
		this.popFrameAndResume(frame.thread, frame.frameId).then(() => {
			this.sendResponse(response);
		}).catch((error) => this.errorResponse(response, `${error}`));
		log("RestartFrameResponse", response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request): Promise<void>
	{
		log("StackTraceRequest", args);
		let thread : threadID | undefined = this.threadHandles.get(args.threadId);
		if (!thread)
		{
			this.errorResponse(response, `No thread with id ${args.threadId}`);
			return;
		}

		let startFrame : number = args.startFrame?args.startFrame:0;
		let length : number = args.levels?args.levels:-1;

		let frames : TR_FramesReply | undefined = await this.client.TR_Frames({
			"thread": thread,
			"startFrame": startFrame,
			"length": length,
		});

		if (frames) {
			let stackFrames : StackFrame[] = [];
			for (let i = 0; i < frames.frames; i++) {
				let cls : ClassInfo | undefined = this.allcalsses_id.get(frames.locations[i].classId);
				if (!cls)
				{
					logError("stackTraceRequest", `cannot get class from classid ${frames.locations[i].classId}.`);
					continue;
				}

				let mth : MethodInfo | undefined = await this.getMethodFromId(frames.locations[i].methodId, cls);
				if (!mth)
				{
					continue;
				}

				//get the line info 
				let lineInfo : SmaliLineInfo | undefined = this.smali.getLineInfoByOffset(cls.getSourcePath(this.cwd), mth.protoType, frames.locations[i].index);
				let line : number = lineInfo?lineInfo.line:0;

				const uniqueStackFrameId = this.frameMgr.addThreadFrame(args.threadId, {
					"clsName" : cls.signature,
					"clsfile" : cls.getSourcePath(this.cwd),
					"frameId" : frames.frameIds[i],
					"handleID" : 0,
					"line" : line,
					"mthName" : mth.protoType,
					"offset" : frames.locations[i].index,
					"thread" : thread,
				});
				stackFrames.push(new StackFrame(uniqueStackFrameId, cls.signature + "->" + mth.protoType, 
					new Source(cls.getSourcePath(this.cwd)), line, 0));
			}

			response.body = { stackFrames, totalFrames: frames.frames };
		}

		this.sendResponse(response);
		log("StackTraceResponse", response);
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments, request?: DebugProtocol.Request): void
	{
		log("sourceRequest", args);
		const content = "/*\r\n" + 
		"The source for this class is unavailable.\r\n" + 
		"*/";
		response.body = { content };
		this.sendResponse(response);
		log("sourceRequest", response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request): void
	{
		log("ScopesRequest", args);
		let frame : JavaFrame | undefined = this.frameMgr.getFrameFromId(args.frameId);
		if (!frame)
		{
			this.errorResponse(response, `No frame with id ${args.frameId}`);
			return;
		}

		let localVar : DebugVariable = {
			"id" : 0,
			"name" : "Local",
			"orignalValue" : {"tag" : JdwpType.JT_VOID, "value" : {}},
			"realValue" : 0,
			"refTypeId" : 0,
			"type" : JdwpType.JT_VOID,
			"value" : '',
			"frameId" : args.frameId,
			"frame" : frame.frameId,
			"thread" : frame.thread,
			"children" : [],
		};

		this.frameMgr.addFrameVariable(args.frameId, localVar);

		let regs : SmaliLocalReg[] | undefined = this.smali.getLocalRegs(frame.clsfile, frame.mthName, Number(frame.offset));
		for (let i = 0; regs && i < regs.length; i++) {
			let type : JdwpType = convertStringType(regs[i].type);
			let slotVar: DebugVariable = {
				"id" : 0,
				"name" : regs[i].name,
				"slot" : regs[i].slot,
				"orignalValue": { "tag": type, "value": {} },
				"realValue": 0,
				"refTypeId": 0,
				"realType" : regs[i].type,
				"type" : type,
				"value" : '',
				"frameId" : args.frameId,
				"frame": frame.frameId,
				"thread" : frame.thread,
			};

			this.frameMgr.addFrameVariable(args.frameId, slotVar);
			localVar.children?.push(slotVar);
		}

		const scopes = new Array<Scope>();
		scopes.push(new Scope("Local", localVar.id, false));
		response.body = { scopes };
		this.sendResponse(response);
		log("ScopesResponse", response);
	}

	protected getLocalVariableValue(variable : DebugVariable) : string | undefined
	{
		//local variable
		if (!variable.frame || !variable.thread)
		{
			return "variable's frame or thread is undefined.";
		}

		if (!variable.children)
		{
			return undefined;
		}

		let slots : number[] = [];
		let types : JdwpType[] = [];

		for (let i = 0; i < variable.children.length; i++)
		{
			let child : DebugVariable = variable.children[i];
			if (!child.slot)
			{
				return `local variable ${variable.children[i].name} slot undefined. `;
			}

			slots.push(child.slot);
			types.push(child.type);
		}

		this.client.SF_GetValues({
			"frame" : variable.frame,
			"thread" : variable.thread,
			"count" : variable.children.length,
			"slots" : slots,
			"sigbytes" : types,
		}).then((reply) => {
			if (!reply)
			{
				return `get local variable ${variable.name} failed.`;
			}

			for (let i = 0; i < reply.slotValues.length; i++) {
				if (variable.children && variable.children[i]) {
					let child : DebugVariable = variable.children[i];
					child.orignalValue = reply.slotValues[i];

					//if object or array
					if (JdwpType.JT_ARRAY == child.orignalValue.tag || 
						JdwpType.JT_OBJECT == child.orignalValue.tag) 
					{
						//get refid
						this.client.OR_ReferenceType(
							{
								"object" : child.orignalValue.value.A?child.orignalValue.value.A:(child.orignalValue.value.L?child.orignalValue.value.L:0),
							}
						).then((reply) => {
							if (reply)
							{
								child.refTypeId = reply.typeID;
								this.client.RT_Signature({
									"refType" : reply.typeID,
								}).then((reply2) => {
									if (reply2)
									{
										child.realType = reply2.signature;
									}
								}).catch((error) => {return `${error}`;});
							}
						}).catch((error) => {return `${error}`;});

						if (JdwpType.JT_ARRAY == child.orignalValue.tag)
						{
							child.size = 0;
							this.client.AR_Length(
								{
									"arrayObject" : child.orignalValue.value.A?child.orignalValue.value.A:0,
								}
							).then((reply) => {
								if (reply)
								{
									child.size = reply.arrayLength;
								}
							}).catch((error) => {return `${error}`;});
						}
					}

					this.frameMgr.updateDebugVariableValue(child);
				}
			}
		}).catch((error) => {return `${error}`;});

		return undefined
	}

	protected getLocalVariableValue_OneByOne(variable : DebugVariable) : string | undefined
	{
		//local variable
		if (!variable.frame || !variable.thread)
		{
			return "variable's frame or thread is undefined.";
		}

		if (!variable.children)
		{
			return undefined;
		}

		for (let i = 0; i < variable.children.length; i++)
		{
			let child : DebugVariable = variable.children[i];
			if (!child.slot)
			{
				return `local variable ${variable.children[i].name} slot undefined. `;
			}

			let slots: number[] = [];
			let types: JdwpType[] = [];
			slots.push(child.slot);
			types.push(child.type);

			this.client.SF_GetValues({
				"frame": variable.frame,
				"thread": variable.thread,
				"count": variable.children.length,
				"slots": slots,
				"sigbytes": types,
			}).then((reply) => {
				if (reply) {
					for (let j = 0; j < reply.slotValues.length; j++) {
						if (variable.children && variable.children[j]) {
							let child: DebugVariable = variable.children[j];
							child.orignalValue = reply.slotValues[j];
	
							//if object or array
							if (JdwpType.JT_ARRAY == child.orignalValue.tag ||
								JdwpType.JT_OBJECT == child.orignalValue.tag) {
								//get refid
								this.client.OR_ReferenceType(
									{
										"object": child.orignalValue.value.A ? child.orignalValue.value.A : (child.orignalValue.value.L ? child.orignalValue.value.L : 0),
									}
								).then((reply) => {
									if (reply) {
										child.refTypeId = reply.typeID;
										this.client.RT_Signature({
											"refType": reply.typeID,
										}).then((reply2) => {
											if (reply2) {
												child.realType = reply2.signature;
											}
										}).catch((error) => { return `${error}`; });
									}
								}).catch((error) => { return `${error}`; });
	
								if (JdwpType.JT_ARRAY == child.orignalValue.tag) {
									child.size = 0;
									this.client.AR_Length(
										{
											"arrayObject": child.orignalValue.value.A ? child.orignalValue.value.A : 0,
										}
									).then((reply) => {
										if (reply) {
											child.size = reply.arrayLength;
										}
									}).catch((error) => { return `${error}`; });
								}
							}
	
							this.frameMgr.updateDebugVariableValue(child);
						}
					}
				}
				else
				{
					if (variable.children && variable.children[0])
					{
						variable.children[0].value = 'geterror';
					}
				}
			}).catch((error) => { return `${error}`; });
		}

		return undefined
	}

	protected getArrayVariableValue(size : number, variable : DebugVariable) : string | undefined
	{
		if ('bigint' != typeof(variable.realValue) && 
			'number' != typeof(variable.realValue))
		{
			return "variable's realValue type is unvalid.";
		}

		this.client.AR_GetValues({
			"arrayObject": variable.realValue,
			"firstIndex": 0,
			"length" : size,
		}).then((reply) => {
			if (!reply)
			{
				return `get Array variable ${variable.name} failed.`;
			}

			if (0 == reply.values.primitiveValues?.length &&
				0 == reply.values.objectValues?.length) {
				return undefined;
			}

			variable.children = [];
			if (isPrimitiveType(reply.values.tag))
			{
				for (let i = 0; reply.values.primitiveValues && i < reply.values.primitiveValues.length; i++)
				{
					let child : DebugVariable = {
						"id" : 0,
						"frameId" : variable.frameId,
						"realValue" : 0,
						"refTypeId" : 0,
						"value" : "",
						"type" : reply.values.tag,
						"name" : i.toString(),
						"parent" : variable,
						"orignalValue" : {
							"tag" : reply.values.tag,
							"value" : reply.values.primitiveValues[i],
						}
					};

					child.id = this.frameMgr.addFrameVariable(variable.frameId, child);
					this.frameMgr.updateDebugVariableValue(child);
					variable.children.push(child);
				}
			}
			else
			{
				for (let i = 0; reply.values.objectValues && i < reply.values.objectValues.length; i++)
				{
					let child : DebugVariable = {
						"id" : 0,
						"frameId" : variable.frameId,
						"realValue" : 0,
						"refTypeId" : 0,
						"value" : "",
						"type" : reply.values.tag,
						"name" : i.toString(),
						"parent" : variable,
						"orignalValue" : reply.values.objectValues[i],
					};

					child.id = this.frameMgr.addFrameVariable(variable.frameId, child);
					this.frameMgr.updateDebugVariableValue(child);
					variable.children.push(child);
				}
			}
		}).catch((error) => {return `${error}`;});

		return undefined;
	}

	protected getObjectVariableValue(refType : referenceTypeID,  variable : DebugVariable) : string | undefined
	{
		if ('boolean' == typeof(variable.realValue))
		{
			return "varaible object id type is unvalid.";
		}

		//just for compile error
		let objId : objectID = variable.realValue;

		this.client.RT_Fields({
			"refType" : variable.refTypeId,
		}).then((reply) => {
			if (!reply)
			{
				return `get fields of referencetype ${variable.realType} failed.`;
			}

			let staticFields : fieldID[] = [];
			let staticNames : string[] = [];
			let staticSignatures : string[] = [];
			let normalFields : fieldID[] = [];
			let normalNames : string[] = [];
			let normalSignatures : string[] = [];

			for (let i = 0; i < reply.declared; i++)
			{
				if (reply.modBits[i] & 0x0008)
				{
					staticFields.push(reply.fieldId[i]);
					staticNames.push(reply.name[i]);
					staticSignatures.push(reply.signature[i]);
				}
				else
				{
					normalFields.push(reply.fieldId[i]);
					normalNames.push(reply.name[i]);
					normalSignatures.push(reply.signature[i]);
				}
			}

			variable.children = [];
			this.client.OR_GetValues({
				"object" : objId,
				"fieldIds" : normalFields,
			}).then((reply2) => {
				if (!reply2) {
					return `get object fields ${variable.name} failed.`;
				}

				for (let i = 0; i < reply2.values.length; i++)
				{
					let child : DebugVariable = {
						"id" : 0,
						"frameId" : variable.frameId,
						"realValue" : 0,
						"refTypeId" : 0,
						"value" : "",
						"realType" : normalSignatures[i],
						"type" : reply2.values[i].tag,
						"name" : normalNames[i],
						"parent" : variable,
						"static" : false,
						"orignalValue" : reply2.values[i],
					};

					child.fieldId = normalFields[i];
					child.id = this.frameMgr.addFrameVariable(variable.frameId, child);
					this.frameMgr.updateDebugVariableValue(child);
					variable.children?.push(child);
				}
			}).catch((error) => {return `${error}`;});

			this.client.RT_GetValues({
				"refType" : variable.refTypeId,
				"fieldIds" : staticFields,
			}).then((reply3) => {
				if (!reply3) {
					return `get object fields ${variable.name} failed.`;
				}

				for (let i = 0; i < reply3.values.length; i++)
				{
					let child : DebugVariable = {
						"id" : 0,
						"frameId" : variable.frameId,
						"realValue" : 0,
						"refTypeId" : 0,
						"value" : "",
						"realType" : staticSignatures[i],
						"type" : reply3.values[i].tag,
						"name" : staticNames[i],
						"parent" : variable,
						"static" : true,
						"orignalValue" : reply3.values[i],
					};

					child.fieldId = staticFields[i];
					child.id = this.frameMgr.addFrameVariable(variable.frameId, child);
					this.frameMgr.updateDebugVariableValue(child);
					variable.children?.push(child);
				}
			}).catch((error) => {return `${error}`;});
		}).catch((error) => {return `${error}`;});

		return undefined;
	}

	protected getVariableValue(variable : DebugVariable) : string | undefined
	{
		if ("Local" == variable.name)
		{
			return this.getLocalVariableValue_OneByOne(variable);
			//return this.getLocalVariableValue(variable);
		}
		else if (variable.size)
		{
			return this.getArrayVariableValue(variable.size, variable);
		}
		else if (variable.refTypeId)
		{
			return this.getObjectVariableValue(variable.refTypeId, variable);
		}

		return undefined;
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): Promise<void>
	{
		log("VariablesRequest", args);
		let variable : DebugVariable | undefined = this.frameMgr.getVariableFromId(args.variablesReference);
		if (!variable)
		{
			this.errorResponse(response, `No variable with id ${args.variablesReference}`);
			return;
		}

		let error : string | undefined = this.getVariableValue(variable);
		if (error)
		{
			this.errorResponse(response, error);
		}
		else {
			let vars : Variable[] = [];
			//if ("Local" != variable.name) {
			//	vars.push(new Variable(variable.name, variable.value, variable.referenceId));
			//}
			for (let i = 0; variable.children && i < variable.children.length; i++)
			{
				vars.push(new Variable(variable.children[i].name, variable.children[i].value, variable.children[i].referenceId));
			}
			response.body = { variables: vars };
			this.sendResponse(response);
		}

		log("VariablesResponse", response);
	}

	protected setLocalVariableValue(variable : DebugVariable, value : javaValue) : void
	{
		if (!variable.frame || !variable.thread || !variable.slot)
		{
			return ;
		}

		let slots : number[] = [];
		slots.push(variable.slot);
		let values : javaValue[] = [];
		values.push(value);
		
		this.client.SF_SetValues(
			{
				"frame" : variable.frame,
				"thread" : variable.thread,
				"count" : 1,
				"slots" : slots,
				"slotValues" : values,
			}
		).then((reply) => {
			if (reply)
			{
				variable.orignalValue = value;
				this.frameMgr.updateDebugVariableValue(variable);
			}
		}).catch(() => {return ;});
	}

	protected setArrayVariableValue(variable : DebugVariable, index : number, value : javaValue) : void
	{
		if ('boolean' == typeof(variable.realValue) || 
			!variable.children)
		{
			return ;
		}

		let child : DebugVariable = variable.children[index];
		let values : javaUntaggedValue[] = [];
		values.push(value.value);

		this.client.AR_SetValues(
			{
				"arrayObject" : variable.realValue,
				"firstIndex" : index,
				"values" : values,
			}
		).then((reply) => {
			if (reply)
			{
				child.orignalValue = value;
				this.frameMgr.updateDebugVariableValue(child);
			}
		}).catch(() => {return ;});
	}

	protected setClassVariableValue(variable : DebugVariable, refTypeId : referenceTypeID, value : javaValue) : void
	{
		if (!variable.fieldId)
		{
			return ;
		}

		let fieldIds : fieldID[] = [];
		fieldIds.push(variable.fieldId);
		let values : javaUntaggedValue[] = [];
		values.push(value.value);

		this.client.CT_SetValues(
			{
				"clazz" : refTypeId,
				"count" : 1,
				"fieldIds" : fieldIds,
				"values" : values,
			}
		).then((reply) => {
			if (reply)
			{
				variable.orignalValue = value;
				this.frameMgr.updateDebugVariableValue(variable);
			}
		}).catch(() => {return ;});
	}

	protected setObjectVariableValue(variable : DebugVariable, object : objectID, value : javaValue) : void
	{
		if (!variable.fieldId)
		{
			return ;
		}

		let fieldIds : fieldID[] = [];
		fieldIds.push(variable.fieldId);
		let values : javaUntaggedValue[] = [];
		values.push(value.value);

		this.client.OR_SetValues({
			"object" : object,
			"count" : 1,
			"fieldIds" : fieldIds,
			"values" : values,
		}).then((reply) => {
			if (reply)
			{
				variable.orignalValue = value;
				this.frameMgr.updateDebugVariableValue(variable);
			}
		}).catch(() => {return ;});
	}

	protected setStringVariableValue(variable : DebugVariable, value : string) : void
	{
		this.client.VM_CreateString(
			{
				"utf" : value,
			}
		).then((reply) => {
			if (reply)
			{
				this.setVariableValue(variable, reply.stringObject.toString());
			}
		}).catch(() => {return ;});
	}

	protected setVariableValue(variable : DebugVariable, value : string) : void
	{
		let fValue : javaValue = formatStringValue(value, variable.type);
		if (variable.slot)
		{
			this.setLocalVariableValue(variable, fValue);
		}
		else if (variable.parent)
		{
			let parent : DebugVariable = variable.parent;
			if (parent.type == JdwpType.JT_ARRAY)
			{
				this.setArrayVariableValue(parent, parseInt(variable.name), fValue);
			}
			else if (parent.type == JdwpType.JT_STRING)
			{
				this.setStringVariableValue(parent, value);
			}
			else
			{
				if ('boolean' == typeof(parent.realValue))
				{
					return ;
				}

				if (true === variable.static)
				{
					this.setClassVariableValue(variable, parent.refTypeId, fValue);
				}
				else{
					this.setObjectVariableValue(variable, parent.realValue, fValue);
				}
			}
		}
	}

	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments, request?: DebugProtocol.Request): Promise<void>
	{
		log("SetVariablesRequest", args);
		let variable : DebugVariable | undefined = this.frameMgr.getVariableFromId(args.variablesReference);
		if (!variable)
		{
			this.errorResponse(response, `No variable with id ${args.variablesReference}`);
			return;
		}

		if (!variable.children)
		{
			this.errorResponse(response, `No variable with name ${args.name}`);
			return;
		}

		let targetVar : DebugVariable | undefined = undefined;
		for (let i = 0; i < variable.children.length; i++)
		{
			if (args.name == variable.children[i].name)
			{
				targetVar = variable.children[i];
				this.setVariableValue(variable.children[i], args.value);
				break;
			}
		}

		response.body = response.body || {};
		response.body.value = targetVar?targetVar.value:"error";
		log("SetVariablesResponse", response);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request): void 
	{
		log("EvaluateRequest", args);
		//TODO:implement the evalue function
		//currently a simple implementation just support hover
		if (args.frameId && 'hover' === args.context) {
			response.body = response.body || {};
			if (/^(v|p)[0-9]+/.test(args.expression)){
				let vars : DebugVariable | undefined = this.frameMgr.getVariableFromName(args.frameId, args.expression);
				if (vars)
				{
					response.body.result = vars.value;
					response.body.variablesReference = vars.referenceId?vars.referenceId:0;
				}
			}

			this.sendResponse(response);
		}
		else
		{
			this.errorResponse(response, "unsupport evaluate implementation.");
		}
		
		log("EvaluateResponse", response);
	}
}
