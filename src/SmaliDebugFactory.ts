import * as vscode from 'vscode';
import { ASDebugSession } from './SmaliDebug';

export class SmaliDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory
{
    public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor>
    {
        if (session.configuration.debugAdapter == "inline")
        {
            return  new vscode.DebugAdapterInlineImplementation(new ASDebugSession);
        }

        return executable;
    }

    public async dispose() {
		console.log('SmaliDebugAdapterDescriptorFactory.dispose');
	}
}
