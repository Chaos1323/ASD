import { runCommand, LocalCommand } from "./utils";

export interface DeviceItem
{
    serial : string;
    deviceDesc : string;
    tid : string;
}

export interface ProcessItem
{
    pid : string;
    ppid : string;
    name : string;
} 

export class AdbClient
{
    public static device_sid : string;

    public constructor()
    {
        AdbClient.device_sid = "";
    }

    public static async checkAdbExist() : Promise<Boolean>
    {
        let res = false;
        const adb : LocalCommand = {
            command : "adb",
            args : ['version']
        };

        const { stdout } =  await runCommand(adb);

        res = /^Android.+Version.+Installed as.+/.test(stdout);
        return res;
    }

    public static setTargetDevice(sid : string)
    {
        AdbClient.device_sid = sid;
    }

    public static async getDevices() : Promise<DeviceItem[]>
    {
        const adb : LocalCommand = {
            command : "adb",
            args : ['devices', '-l']
        };

        const { stdout } =  await runCommand(adb);

        //parse the stdout
        let lines = stdout.trim().split(/\r\n?|\n/);
        lines.sort();
        const devicelist : DeviceItem[] = [];
        for (let i = 0; i < lines.length; i++)
        {
            const m = lines[i].match(/([^\t]+)\s+([^\t]+transport_id:([0-9]+))/);
            if (m)
            {
                devicelist.push({
                    serial : m[1],
                    deviceDesc : m[2],
                    tid : m[3]
                })
            }
        }

        return devicelist;
    }

    public static async getProcesses() : Promise<ProcessItem[]>
    {
        const adb : LocalCommand = {
            command : "adb",
            args : ['-s', AdbClient.device_sid, 'shell', 'ps']
        };

        const { stdout } =  await runCommand(adb);

        //parse process 
        let lines = stdout.trim().split(/\r\n?|\n/);
        lines.sort();
        const processlist : ProcessItem[] = [];
        for (let i = 0; i < lines.length; i++)
        {
            const m = lines[i].match(/(u[^\s]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([A-Z]+)\s+([^\s]+)/);
            if (m)
            {
                processlist.push({
                    pid : m[2],
                    ppid : m[3],
                    name : m[9]
                })
            }
        }

        return processlist;
    }

    public static async getProcessIdByName(packageName : string) : Promise<string>
    {
        let processlist : ProcessItem[] = await this.getProcesses();
        let processId : string = "";

        for (let i= 0; i < processlist.length; i++)
        {
            if (packageName == processlist[i].name)
            {
                processId = processlist[i].pid;
                break;
            }
        }

        return processId;
    }

    public static async launchApp(packageName : string) : Promise<string>
    {
        const adb : LocalCommand = {
            command : "adb",
            args : ['-s', AdbClient.device_sid, 'shell', 'monkey', '-p', packageName, '1']
        };

        const { stdout } =  await runCommand(adb);
        return this.getProcessIdByName(packageName);
    }

    public static async forwardJdwp(pid : string) : Promise<string>
    {
        const adb : LocalCommand = {
            command : "adb",
            args : ['-s', AdbClient.device_sid, 'forward', 'tcp:13131', 'jdwp:' + pid]
        };

        const { stdout } =  await runCommand(adb);

        //always success
        return "success";
    }

    public static async adbCommand(option : string) : Promise<string>
    {
        const adb : LocalCommand = {
            command : "adb",
            args : ['-s', AdbClient.device_sid, option]
        };

        const { stdout } =  await runCommand(adb);
        return stdout;
    }
}
