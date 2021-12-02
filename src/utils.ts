import * as cp from 'child_process';
import exp = require('constants');
import path = require('path');
import { logger } from 'vscode-debugadapter/lib/logger';
import { javaUntaggedValue, javaValue, objectIDSize } from './buffer';
import { JdwpClassStatus, JdwpType } from './JDWPConstants';

export class PromiseCompleter<T> {
	public promise: Promise<T>;
	public resolve!: (value: T | PromiseLike<T>) => void;
	public reject!: (error?: any, stackTrace?: string) => void;

	constructor() {
		this.promise = new Promise((res, rej) => {
			this.resolve = res;
			this.reject = rej;
		});
	}
}

export interface LocalCommand {
	command: string;
	args: string[];
}

export async function runCommand(processCmd : LocalCommand) : Promise<{ err: cp.ExecException | null; stdout: string; stderr: string }>
{
    return await new Promise<{ err: cp.ExecException | null; stdout: string; stderr: string }>((resolve) => {
		cp.execFile(processCmd.command, processCmd.args, (err, stdout, stderr) => {
			resolve({ err, stdout, stderr });
		});
	});
}

export function safeSpawn(workingDirectory: string | undefined, binPath: string, args: string[], env: { [key: string]: string | undefined } | undefined): cp.ChildProcessWithoutNullStreams
{
	const quotedArgs = args.map((a) => `"${a.replace(/"/g, `\\"`)}"`);
	const customEnv = Object.assign({}, process.env, env);
	return cp.spawn(`"${binPath}"`, quotedArgs, { cwd: workingDirectory, env: customEnv, shell: true });
}

export function runCommand2(binPath: string, args: string[], workingDirectory: string | undefined, env: { [key: string]: string | undefined } | undefined): Promise<string>
{
	return new Promise((resolve) => {
		const proc = safeSpawn(workingDirectory, binPath, args, env);
		const out: string[] = [];
		const err: string[] = [];
		proc.stdout.on("data", (data: Buffer) => out.push(data.toString()));
		proc.stderr.on("data", (data: Buffer) => err.push(data.toString()));
		proc.on("exit", () => {
			resolve(out.join("") + err.join(""));
		});
	});
}

//log
function logArgsToString(args: any[]): string {
	return args
		.map((arg) => {
			return typeof arg === 'string' ? arg : JSON.stringify(arg);
		})
		.join(' ');
}

export function log(...args: any[]) {
	logger.warn(logArgsToString(args));
}

export function logError(...args: any[]) {
	logger.error(logArgsToString(args));
}

//others
export function getClassStatus(status: number): string {
	let res: string = "";
	if (status & JdwpClassStatus.CS_VERIFIED) {
		res += "_VERIFIED_";
	}

	if (status & JdwpClassStatus.CS_PREPARED) {
		res += "_PREPARED_";
	}

	if (status & JdwpClassStatus.CS_INITIALIZED) {
		res += "_INITIALIZED_";
	}

	if (status & JdwpClassStatus.CS_ERROR) {
		res += "_ERROR_";
	}

	return res;
}

export function formatClsNameFromPath(rootDir: string, fullPath: string): string {
	let clsName: string = fullPath.slice(fullPath.indexOf(rootDir) + rootDir.length);
	clsName = clsName.slice(0, clsName.lastIndexOf("."));
	let re = new RegExp('[\\' + `${path.sep}` + ']', 'g');
	clsName = "L" + clsName.replace(re, '/') + ";";
	return clsName;
}

export function isPrimitiveType(type : JdwpType) : boolean
{
	if (JdwpType.JT_BOOLEAN == type || 
		JdwpType.JT_BYTE == type || 
		JdwpType.JT_CHAR == type || 
		JdwpType.JT_FLOAT == type || 
		JdwpType.JT_INT == type || 
		JdwpType.JT_DOUBLE == type || 
		JdwpType.JT_LONG == type || 
		JdwpType.JT_VOID == type || 
		JdwpType.JT_SHORT == type )
	{
		return true;
	}

	return false;
}

export function formatStringValue(value : string, tag : JdwpType) : javaValue
{
	let untaggedValue : javaUntaggedValue = {};
	switch (tag) {
		case JdwpType.JT_ARRAY:
			if (8 == objectIDSize)
			{
				untaggedValue.A = BigInt(value);
			}
			else
			{
				untaggedValue.A = parseInt(value);
			}
			break;
		case JdwpType.JT_BYTE:
			untaggedValue.B = parseInt(value);
			break;
		case JdwpType.JT_CHAR:
			untaggedValue.C = parseInt(value);
			break;
		case JdwpType.JT_OBJECT:
			if (8 == objectIDSize)
			{
				untaggedValue.L = BigInt(value);
			}
			else
			{
				untaggedValue.L = parseInt(value);
			}
			break;
		case JdwpType.JT_FLOAT:
			untaggedValue.F = parseInt(value);
			break;
		case JdwpType.JT_DOUBLE:
			untaggedValue.D = BigInt(value);
			break;
		case JdwpType.JT_INT:
			untaggedValue.I = parseInt(value);
			break;
		case JdwpType.JT_LONG:
			untaggedValue.J = BigInt(value);
			break;
		case JdwpType.JT_SHORT:
			untaggedValue.S = parseInt(value);
			break;
		case JdwpType.JT_VOID:
			break;
		case JdwpType.JT_BOOLEAN:
			untaggedValue.Z = Boolean(value);
			break;
		case JdwpType.JT_STRING:
			if (8 == objectIDSize)
			{
				untaggedValue.s = BigInt(value);
			}
			else
			{
				untaggedValue.s = parseInt(value);
			}
			break;
		case JdwpType.JT_THREAD:
			if (8 == objectIDSize)
			{
				untaggedValue.t = BigInt(value);
			}
			else
			{
				untaggedValue.t = parseInt(value);
			}
			break;
		case JdwpType.JT_THREAD_GROUP:
			if (8 == objectIDSize)
			{
				untaggedValue.g = BigInt(value);
			}
			else
			{
				untaggedValue.g = parseInt(value);
			}
			break;
		case JdwpType.JT_CLASS_LOADER:
			if (8 == objectIDSize)
			{
				untaggedValue.l = BigInt(value);
			}
			else
			{
				untaggedValue.l = parseInt(value);
			}
			break;
		case JdwpType.JT_CLASS_OBJECT:
			if (8 == objectIDSize)
			{
				untaggedValue.c = BigInt(value);
			}
			else
			{
				untaggedValue.c = parseInt(value);
			}
			break;
		default:
			break;
	}

	return {
		"tag" : tag,
		"value" : untaggedValue,
	};
}

export function convertStringType(type : string) : JdwpType
{
	switch (type[0]) {
		case '[':
			return JdwpType.JT_ARRAY;
		case 'B':
			return JdwpType.JT_BYTE;
		case 'C':
			return JdwpType.JT_CHAR;
		case 'L':
			return JdwpType.JT_OBJECT;
		case 'F':
			return JdwpType.JT_FLOAT;
		case 'D':
			return JdwpType.JT_DOUBLE;
		case 'I':
			return JdwpType.JT_INT;
		case 'J':
			return JdwpType.JT_LONG;
		case 'S':
			return JdwpType.JT_SHORT;
		case 'Z':
			return JdwpType.JT_BOOLEAN;
		case 's':
			return JdwpType.JT_STRING;
		case 't':
			return JdwpType.JT_THREAD;
		case 'g':
			return JdwpType.JT_THREAD_GROUP;
		case 'l':
			return JdwpType.JT_CLASS_OBJECT;
		case 'c':
			return JdwpType.JT_CLASS_OBJECT;
		default:
			break;
	}

	return JdwpType.JT_VOID;
}
