# ASD

Android Smali bytecode Debugger

## Features

 - Smali code debugging
 - Line breakpoints
 - Display variables
 - Modify variable's value

## Requirements

 - adb tool should be installed
 - the adb tool path should be added into the system EV,you can check in cmd with `adb version` commandline
 - use the baksmali to get the apk smali code

## HOW TO

1.use the baksmali to generate the apk smali code

2.enter the code directory, then execute `code ./` command

3.in the vscode, open any smali file, then press `F5`

4.follow the tips to create a launch task json file

5.select ASD configure item

6.finally the `launch.json` content should be like this
    {
        "version": "0.2.0",
        "configurations": [
            {
                "type": "ASD",
                "request": "launch",
                "name": "Smali Launch",
                "packageName": "xxx.xxxxx",
                "mainActivity": "xxx.xxxxx.MainActivity",
                "deviceId": "xxxxxxx",
                "workDir": "${workspaceFolder}"
            }
       ]
    }
*
    * the `packageName` : the apk package name
    * the `mainActivity` : the apk entry class
    * the `deviceId` : your device id which getted from the `adb devices` command

## TO DO
 - implement the evaluate function totally
 - make the array value to display better
 - add the unit-test suite

## Other

 You can use this debugger extension with other smali language server extension to valid the code browsing.
