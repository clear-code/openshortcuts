/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is "Open Windows Shortcuts Directly".
 *
 * The Initial Developer of the Original Code is ClearCode Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008-2012
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): ClearCode Inc. <info@clear-code.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

window.addEventListener('DOMContentLoaded', function() {
	window.removeEventListener('DOMContentLoaded', arguments.callee, false);

	if ('WindowsShortcutHandler' in window) return;

	if ('openAttachment' in window) {
		eval('window.openAttachment = '+
			window.openAttachment.toSource().replace(
				'{',
				<![CDATA[$&
					if (window.WindowsShortcutHandler.checkAndOpen(aAttachment))
						return;
				]]>.toString()
			)
		);
	}

	if ('AttachmentInfo' in window) {
		var originalOpen = AttachmentInfo.prototype.open;
		AttachmentInfo.prototype.open = function () {
			this.displayName = this.name;
			if (window.WindowsShortcutHandler.checkAndOpen(this))
				return;
			originalOpen.call(this);
		};
	}

	// Bug 524874  Windows Shortcuts (.lnk) into the attachment and send not working
	// https://bugzilla.mozilla.org/show_bug.cgi?id=524874
	if ('AddUrlAttachment' in window) {
		eval('window.AddUrlAttachment = '+
			window.AddUrlAttachment.toSource().replace(
				'gContentChanged = true;',
				'$& WindowsShortcutHandler.ensureAttachLinkFile(attachment);'
			)
		);
	}
	if ('FileToAttachment' in window) {
		eval('window.FileToAttachment = '+
			window.FileToAttachment.toSource().replace(
				'return attachment;',
				'return WindowsShortcutHandler.ensureAttachLinkFile(attachment);'
			)
		);
	}
	if ('envelopeDragObserver' in window &&
		'onDrop' in envelopeDragObserver) {
		eval('envelopeDragObserver.onDrop = '+
			envelopeDragObserver.onDrop.toSource().replace(
				'attachments.push(attachment);',
				'attachments.push(WindowsShortcutHandler.ensureAttachLinkFile(attachment));'
			)
		);
	}

	window.WindowsShortcutHandler = {
		checkAndOpen : function(aAttachment) {
			var fileName = aAttachment.displayName;
			if (!/\.lnk$/i.test(fileName)) return false;

			if (aAttachment.isExternalAttachment ||
				/^file:\/\//.test(aAttachment.url)) {
				try {
					var file = this.fileHandler.getFileFromURLSpec(aAttachment.url);
					file.QueryInterface(Components.interfaces.nsILocalFile)
						.launch();
					return true;
				}
				catch(e) {
				}
			}
			else {
				try {
					var dest = this.getTempFolder();

					// 同名のファイルがある場合は先に削除する
					var temp = dest.clone();
					temp.append(fileName);
					// tempのexists()が、ファイルが存在していても何故かfalseを返す事がある。
					// その場合、同じパスで作った別のファイルハンドラだと正しい結果が返ってくる。
					temp = this.getFileWithPath(temp.path);
					if (temp.exists()) {
						var index = this.tempFiles.indexOf(temp);
						if (index > -1) this.tempFiles.splice(index, 1);
						temp.remove(true);
					}

					dest = messenger.saveAttachmentToFolder(
						aAttachment.contentType,
						aAttachment.url,
						encodeURIComponent(fileName),
						(
							aAttachment.uri || // Thunderbird 3 or later
							aAttachment.messageUri // Thunderbird 2
						),
						dest
					);
					var delay = 200;
					var count = 0;
					window.setTimeout(function(aSelf) {
						if (dest.exists()) {
							aSelf.tempFiles.push(dest);
							dest.QueryInterface(Components.interfaces.nsILocalFile)
								.launch();
						}
						else if (++count < 50) {
							window.setTimeout(arguments.callee, delay, aSelf);
						}
					}, delay, this);
					return true;
				}
				catch(e) {
				}
			}
			return false;
		},

		mIOService : Components.classes['@mozilla.org/network/io-service;1']
			.getService(Components.interfaces.nsIIOService),

		mDirectoryService : Components.classes['@mozilla.org/file/directory_service;1']
			.getService(Components.interfaces.nsIProperties),

		get fileHandler()
		{
			if (!this.mFileHandler)
				this.mFileHandler = this.mIOService.getProtocolHandler('file')
					.QueryInterface(Components.interfaces.nsIFileProtocolHandler);
			return this.mFileHandler;
		},

		getTempFolder : function()
		{
			return this.mDirectoryService.get('TmpD', Components.interfaces.nsIFile)
						.QueryInterface(Components.interfaces.nsILocalFile);
		},

		getWindowsFolder : function()
		{
			return this.mDirectoryService.get('WinD', Components.interfaces.nsIFile)
						.QueryInterface(Components.interfaces.nsILocalFile);
		},

		getFileWithPath : function(aPath)
		{
			var file = Components.classes['@mozilla.org/file/local;1']
						.createInstance(Components.interfaces.nsILocalFile);
			file.initWithPath(aPath);
			return file;
		},

		tempFiles : [],

		ensureAttachLinkFile : function(aAttachment)
		{
			var source = aAttachment.url;
			if (source.indexOf('file:') != 0) return aAttachment;

			var file = this.fileHandler.getFileFromURLSpec(source);
			if (!/\.lnk$/.test(file.leafName)) return aAttachment;

			// Thunderbird 2以前であれば何もしない
			var XULAppInfo = Components.classes['@mozilla.org/xre/app-info;1']
								.getService(Components.interfaces.nsIXULAppInfo);
			var comparator = Components.classes['@mozilla.org/xpcom/version-comparator;1']
								.getService(Components.interfaces.nsIVersionComparator);
			if (comparator.compare(XULAppInfo.version, '3.0') < 0)
				return aAttachment;

			// リンクファイルをそのまま添付しようとすると、ファイル名はリンクファイルなのに
			// 内容はリンク先のファイル、という状態で添付されてしまう。
			// この判断は添付元のファイルの拡張子によって行われているようなので、
			// 一旦テンポラリフォルダ内に別名でコピーして、そちらを添付する。

			var tempLink = this.getTempFolder();
			tempLink.append('link.tmp');
			tempLink.createUnique(tempLink.NORMAL_FILE_TYPE, 0666);
			tempLink.remove(true);

			try {
				// フォルダへのリンクファイルのコピーに失敗する場合がある。
				// 同じパスで作った別のファイルハンドラだと期待通りの結果になる。
				file = this.getFileWithPath(file.path);
				file.copyTo(tempLink.parent, tempLink.leafName);
				aAttachment.url = this.fileHandler.getURLSpecFromFile(tempLink);
				aAttachment.name = file.leafName;
				aAttachment.size = file.fileSize;
				this.tempFiles.push(tempLink);
				//alert(tempLink.path+'\n'+aAttachment.name);
			}
			catch(e) {
				//alert(e);
			}
			return aAttachment;
		},

		forceCopyLinkFile : function(aFrom, aTo)
		{
			// XPCOM経由でやると、フォルダへのショートカットの複製に失敗する。
			// フォルダの時だけはWindowsネイティブのコマンドで処理する。
			var cmd = this.getWindowsFolder();
			cmd.append('system32');
			cmd.append('cmd.exe');
			if (cmd.exists()) {
				try {
					var process = Components.classes['@mozilla.org/process/util;1']
									.createInstance(Components.interfaces.nsIProcess);
					process.init(cmd);
					var args = [
							'/Q',
							'/C',
							'copy',
							aFrom.path,
							aTo.path
						];
					process.run(false, args, args.length, {});
					if (aTo.exists())
						return;
				}
				catch(e) {
				}
			}

			// fallback to XPCOM solution
			aFrom.copyTo(aTo.parent, aTo.leafName);
		},

		init : function()
		{
			window.addEventListener('unload', this, false);
			window.addEventListener('attachments-added', this, false);
		},

		handleEvent : function(aEvent)
		{
			switch (aEvent.type)
			{
				case 'attachments-added':
					return this.onAttachmentAdded(aEvent);
				case 'unload':
					return this.onUnload();
			}
		},

		onAttachmentAdded : function(aEvent)
		{
			this.ensureAttachLinkFile(aEvent.detail);
		},

		onUnload : function()
		{
			window.removeEventListener('unload', this, false);
			window.removeEventListener('attachments-added', this, false);

			this.tempFiles.forEach(function(aFile) {
				try {
					aFile.remove(true);
				}
				catch(e) {
				}
			});
		}
	};
	window.WindowsShortcutHandler.init();

}, false);
