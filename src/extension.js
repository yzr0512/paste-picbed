// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
"use strict";
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const spawn = require("child_process").spawn;
const oss = require('ali-oss');
const moment = require('moment');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log(
		'Congratulations, your extension "vscode-plugin-picbed" is now active!'
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand(
		"extension.helloWorld",
		function () {
			// The code you place here will be executed every time your command is executed

			// Display a message box to the user
			vscode.window.showInformationMessage("Hello World!");
			
		}
	);

	context.subscriptions.push(disposable);

	context.subscriptions.push(
		vscode.commands.registerCommand("extension.pastePicbed", pastePicbed)
	);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
	console.log("插件已被释放。");
}
exports.deacivate = deactivate;

module.exports = {
	activate,
	deactivate
};

var filePath; // 文件的路径
var folderPath;
var projectPath;

function pastePicbed() {
	// 加载配置
	var config = vscode.workspace.getConfiguration("pastePicbed");
	if (config.alioss.accessKeyId == '' || config.alioss.accessKeySecret == '' || config.alioss.bucket == '' || config.alioss.region == '') {
		vscode.window.showErrorMessage(`accessKeyId, accessKeySecret, bucket or region can't be empty.`);
		return;
	}
	// console.log(config);

	let editor = vscode.window.activeTextEditor;
	if (!editor) return;

	var localPath;
	let m = moment();

	// 如果 localPath 是空则将路径设置当前文件位置
	let fileUri = editor.document.uri;
	if (!fileUri) return;
	// console.log(fileUri);

	filePath = fileUri.fsPath; // 文件的路径
	folderPath = path.dirname(filePath);
	projectPath = vscode.workspace.rootPath;
	// console.log(filePath, folderPath, projectPath);
	
	if (fileUri.scheme === "untitled") {
		// console.log("未命名文件");
		filePath = folderPath;
	}

	if (!config.localPath) {
		// 未设置路径的时候默认取当前文件的位置
		localPath = folderPath;
	} else {
		localPath = replaceToken(m, config.localPath);
	}

	// TODO: 将选中文本作为文件名
	// var selection = editor.selection;
	// var selectText = editor.document.getText(selection);
	// if (selectText && /[\\:*?<>|]/.test(selectText)){
	// 	console.log('Your selection is not a valid filename!');
	// 	return;
	// }
	// console.log("", selectText);

	let imageName = replaceToken(m, config.imageName)+'.png';

	// win平台使用正斜杠\做路径，unix平台使用反斜杠/
	// path会根据平台自动切换，在win平台远程路径会出错，这里需指定远程路径是unix格式。
	let remotePath = path.posix.join(replaceToken(m, config.remotePath), imageName); 
	let imagePath = path.join(localPath, imageName)
	// console.log(localPath);

	createImageLocalPath(localPath, () => {
		// 保存剪贴板的图像，并返回成功后的路径
		saveClipboardImageToFileAndGetPath(
			imagePath,
			(imagePath, imagePathReturnByScript) => {

				// console.log(imagePath, imagePathReturnByScript, remotePath);
				if (imagePathReturnByScript === 'no image') {
					// 非图像则执行粘贴
					console.log('no image');
					vscode.commands.executeCommand('editor.action.clipboardPasteAction');
					return;
				} else {
					let client = new oss({
						region: config.alioss.region,
						accessKeyId: config.alioss.accessKeyId,
						accessKeySecret: config.alioss.accessKeySecret,
						bucket: config.alioss.bucket,
						secure: true
					});

					client.put(remotePath, imagePath).then(function (response) {
						// console.log('put success: ', response);
						// @ts-ignore
						imagePath = '![](' + response.url + ')';
						editor.edit(edit => {
							let current = editor.selection;

							if (current.isEmpty) {
								edit.insert(current.start, imagePath);
							} else {
								edit.replace(current, imagePath);
							}
						});
					}).catch(function (err) {
						vscode.window.showErrorMessage(err);
					});
				}
			}
		);
	});
}

/**
 * 返回符合 ISO 8601 格式的时间字符串
 * @param {number} expire 距离当前时间的秒数
 */
function getISOTime(expire) {
	let d = new Date();
	d.setTime(d.getTime() + expire * 1000);
	d.setHours(d.getHours(), d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString();
}

function replaceToken(m, str) {
	// Y - 四位年份，MM - 两位月份，DD -两位日期
	// h - 小时（12小时制），hh - 小时（24小时制）
	// mm - 两位分钟数
	// ss - 两位秒数
	// return moment.format(str);
	str = str.replace('${year}', m.format('Y'));
	str = str.replace('${month}', m.format('MM'));
	str = str.replace('${day}', m.format('DD'));
	str = str.replace('${hour}', m.format('hh'));
	str = str.replace('${min}', m.format('mm'));
	str = str.replace('${sec}', m.format('ss'));
	str = str.replace('${filePath}', filePath);
	str = str.replace('${folderPath}', folderPath);
	str = str.replace('${projectPath}', projectPath);
	// console.log(str);
	return str
}


function createImageLocalPath(localPath, callback) {
	fs.mkdir(localPath, { recursive: true }, (err) => {
		if (err) {
			// throw err;
			vscode.window.showErrorMessage(err.message);
		} else {
			callback();
		}
	});
}


/**
 * use applescript to save image from clipboard and get file path
 */
function saveClipboardImageToFileAndGetPath(imagePath, callback) {
	if (!imagePath) return;

	let platform = process.platform;
	if (platform === "win32") {
		// Windows
		const scriptPath = path.join(__dirname, "../res/pc.ps1");

		let command =
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
		let powershellExisted = fs.existsSync(command);
		if (!powershellExisted) {
			command = "powershell";
		}

		const powershell = spawn(command, [
			"-noprofile",
			"-noninteractive",
			"-nologo",
			"-sta",
			"-executionpolicy",
			"unrestricted",
			"-windowstyle",
			"hidden",
			"-file",
			scriptPath,
			imagePath
		]);
		powershell.on("error", function (e) {
			if (e.code == "ENOENT") {
				// Logger.showErrorMessage(`The powershell command is not in you PATH environment variables. Please add it and retry.`);
				vscode.window.showErrorMessage(`The powershell command is not in you PATH environment variables. Please add it and retry.`);
			} else {
				// Logger.showErrorMessage(e);			
				vscode.window.showErrorMessage(e);
			}
		});
		powershell.on("exit", function (code, signal) {
			// console.log('exit', code, signal);
		});
		powershell.stdout.on("data", function (data) {
			// cb(imagePath, data.toString().trim());
			callback(imagePath, data.toString().trim());
		});
	} else if (platform === "darwin") {
		// Mac
		let scriptPath = path.join(__dirname, "../res/mac.applescript");

		let ascript = spawn("osascript", [scriptPath, imagePath]);
		ascript.on("error", function (e) {
			// Logger.showErrorMessage(e);
			vscode.window.showErrorMessage(e);
		});
		ascript.on("exit", function (code, signal) {
			// console.log('exit', code, signal);
		});
		ascript.stdout.on("data", function (data) {
			// cb(imagePath, data.toString().trim());
			callback(imagePath, data.toString().trim());
		});
	} else {
		// Linux

		let scriptPath = path.join(__dirname, "../res/linux.sh");

		let ascript = spawn("sh", [scriptPath, imagePath]);
		ascript.on("error", function (e) {
			// Logger.showErrorMessage(e);
			vscode.window.showErrorMessage(e);
		});
		ascript.on("exit", function (code, signal) {
			// console.log('exit', code, signal);
		});
		ascript.stdout.on("data", function (data) {
			let result = data.toString().trim();
			if (result == "no xclip") {
				// Logger.showInformationMessage('You need to install xclip command first.');
				vscode.window.showInformationMessage('You need to install xclip command first.');
				return;
			}
			// cb(imagePath, result);
			callback(imagePath, result);
		});
	}
}
