# README

借鉴了Paste Image的源码实现[GitHub](https://github.com/mushanshitiancai/vscode-paste-image)，在其基础上增加了上传图床功能。

## Features

默认快捷键是 `ctrl+v`。

若剪贴板中的数据是图片则将上传至图床（目前只支持阿里云OSS），并将 markdown 格式的图片链接粘贴到 markdown 文档中。

## Requirements

All requirements are listed in the end of file `package.json`.
You can install them by executing the following command.

```bash
npm install
```

## Release Notes

### 0.0.1, 2020-02-26

初步实现功能。

- [x] bug: win平台上传的图片路径不正确，斜杠反了。

**Enjoy!**
