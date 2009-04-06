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
 * Portions created by the Initial Developer are Copyright (C) 2008
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
				<><![CDATA[$&
					if (window.WindowsShortcutHandler.checkAndOpen(aAttachment))
						return;
				]]></>
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
					var dest = this.mDirectoryService.get('TmpD', Components.interfaces.nsIFile);
					messenger.saveAttachmentToFolder(
						aAttachment.contentType,
						aAttachment.url,
						encodeURIComponent(fileName),
						aAttachment.messageUri,
						dest
					);
					dest.append(fileName);
					var delay = 200;
					var count = 0;
					window.setTimeout(function() {
						if (dest.exists()) {
							dest.QueryInterface(Components.interfaces.nsILocalFile)
								.launch();
						}
						else if (++count < 50) {
							window.setTimeout(arguments.callee, delay);
						}
					}, delay);
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
		}
	};

}, false);
