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
 * Portions created by the Initial Developer are Copyright (C) 2008-2010
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

					// �����̃t�@�C��������ꍇ�͐�ɍ폜����
					var temp = dest.clone();
					temp.append(fileName);
					// temp��exists()���A�t�@�C�������݂��Ă��Ă����̂�false��Ԃ���������B
					// ���̏ꍇ�A�����p�X�ō�����ʂ̃t�@�C���n���h�����Ɛ��������ʂ��Ԃ��Ă���B
					var tempForDelete = Components.classes['@mozilla.org/file/local;1']
											.createInstance(Components.interfaces.nsILocalFile);
					tempForDelete.initWithPath(temp.path);
					if (tempForDelete.exists()) {
						var index = this.tempFiles.indexOf(tempForDelete);
						if (index > -1) this.tempFiles.splice(index, 1);
						tempForDelete.remove(true);
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

		tempFiles : [],

		ensureAttachLinkFile : function(aAttachment)
		{
			var source = aAttachment.url;
			if (source.indexOf('file:') != 0) return;

			var file = this.fileHandler.getFileFromURLSpec(source);
			if (!/\.lnk$/.test(file.leafName)) return;

			// �����N�t�@�C�������̂܂ܓY�t���悤�Ƃ���ƁA�t�@�C�����̓����N�t�@�C���Ȃ̂�
			// ���e�̓����N��̃t�@�C���A�Ƃ�����ԂœY�t����Ă��܂��B
			// ���̔��f�͓Y�t���̃t�@�C���̊g���q�ɂ���čs���Ă���悤�Ȃ̂ŁA
			// ��U�e���|�����t�H���_���ɕʖ��ŃR�s�[���āA�������Y�t����B

			var tempLink = this.getTempFolder();
			tempLink.append('link.tmp');
			tempLink.createUnique(tempLink.NORMAL_FILE_TYPE, 0666);
			tempLink.remove(true);

			try {
				file.copyTo(tempLink.parent, tempLink.leafName);
				aAttachment.url = this.fileHandler.getURLSpecFromFile(tempLink);
				aAttachment.name = file.leafName;
				this.tempFiles.push(tempLink);
//				alert(tempLink.path+'\n'+aAttachment.name);
			}
			catch(e) {
//				alert(e);
			}
		},

		init : function()
		{
			window.addEventListener('unload', this, false);
		},

		handleEvent : function(aEvent)
		{
			window.removeEventListener('unload', this, false);
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
