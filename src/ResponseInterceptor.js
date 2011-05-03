/**
* Copyright (C) 2011 by Edgar Merino (http://devio.us/~emerino)
*
* Licensed under the Artistic License 2.0 (The License).
* You may not use this file except in compliance with the License.
* You may obtain a copy of the License at:
*
* http://www.perlfoundation.org/artistic_license_2_0
*
* THE PACKAGE IS PROVIDED BY THE COPYRIGHT HOLDER AND CONTRIBUTORS "AS
* IS" AND WITHOUT ANY EXPRESS OR IMPLIED WARRANTIES. THE IMPLIED
* WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
* NON-INFRINGEMENT ARE DISCLAIMED TO THE EXTENT PERMITTED BY YOUR LOCAL
* LAW. UNLESS REQUIRED BY LAW, NO COPYRIGHT HOLDER OR CONTRIBUTOR WILL
* BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
* DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THE PACKAGE, EVEN IF
* ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*
* 
* Un ResponseInterceptor se encarga de interceptar las respuestas
* enviadas por un servidor HTTP, siendo posible registrar objetos
* interesados en éstas para su procesamiento.
* 
* Cada ResponseInterceptor debe implementar el método  
* ResponseInterceptor#createChannelListener(matcher),
* el cual debe devolver un nsITraceableListener, que es el que se
* encargará de realizar las acciones necesarias sobre la respuesta recibida.
*
* En el script se incluye una implementación de esta interfaz que se
* encarga de descargar a una carpeta seleccionada el contenido de la
* respuesta, dicha implementación es
* DevPower.Http.ResponseInterceptor.Downloader.
*
* Un interceptor necesita "matchers" para saber qué respuestas interceptar.
* En el script se incluye una implementación básica de uno llamada UrlMatcher,
* el cual verifica si la url de la respuesta actual coincide con alguna de las que
* se tienen registradas en el matcher. Dichas urls deben ser expresiones
* regulares.
*
* Independientemente de la implementación utilizada de los
* nsITraceableListeners, cada uno de estos que se creen almacenarán el listener
* original en la propiedad nsITraceableListenerImplementation.originalListener.
*/


var EXPORTED_SYMBOLS = [ "DevPower", "DevPower.Http" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

/**
 * DevPower namespace
 */ 
if ("undefined" == typeof(DevPower)) {
	var DevPower = {};
}

if ("undefined" == typeof(DevPower.Util)) {
	DevPower.Util = {};
}

if ("undefined" == typeof(DevPower.Http)) {
	DevPower.Http = {};
}

DevPower.Util = {
	/**
	 * Método de utilidad para crear una instancia de la interfaz dada
	 */
	createInstance: function(cName, ifaceName) {
		return Cc[cName].createInstance(Ci[ifaceName]);
	}
}

/**
 *
 * Este objeto se encarga de interceptar todas las respuestas http.
 */
DevPower.Http.ResponseInterceptor = function() {}
DevPower.Http.ResponseInterceptor.prototype = {

	/**
	 * nsIObserver 
	 *
	 * Monitorea las respuestas http
	 */
	_observer: null,

	/**
	 * Lista de los DevPower.Http.ResponseInterceptor.UrlMatcher registrados
	 * con el interceptor
	 */
	matchers: [],

	addMatcher: function(name, matcher) {
		matcher.name = name;
		this.matchers.push(matcher);	
	},

	/**
	 * Registra el objeto con el servicio nsIObserverService para las
	 * notificaciones del tipo "http-on-examine-response"
	 */
	start: function() {
		var interceptor = this;

		this._observer = {
			observe: function(subject, topic, data) {
				if (topic == "http-on-examine-response") {
					subject.QueryInterface(Ci.nsIHttpChannel);
					var matcher = null;

					for (var i in interceptor.matchers) {
						matcher = interceptor.matchers[i];

						if (matcher.match(subject)) {
							try {
								var traceableListener = interceptor.createChannelListener(matcher);
								subject.QueryInterface(Ci.nsITraceableChannel);
								traceableListener.originalListener = subject.setNewListener(traceableListener);
							} catch (e) {
								Components.utils.reportError(e.message);
							}
						}
					}
				}
			}
		};

		var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		observerService.addObserver(this._observer, "http-on-examine-response", false);
	},

	/**
	 * Devuelve un nsITraceableChannel para insertar en el canal http
	 * interceptado.
	 * Recibe el Matcher q provocó la intercepción como parámetro
	 */
	createChannelListener: function(matcher) {
		throw new Error("createTraceableListener(matcher) not implemented yet");
	},

	stop: function() {
		var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		observerService.removeObserver(this._observer, "http-on-examine-response");

		this._observer = null;
	},

	/**
	 * Verifica si se están interceptando repuestas http
	 */
	isRunning: function() {
		return this._observer != null;
	}

}

DevPower.Http.ResponseInterceptor.Matcher = function() {
	this.name = null;
}

DevPower.Http.ResponseInterceptor.Matcher.prototype = {

	match: function(subject) {
		return false;
	},
}

/**
 * Un UrlMatcher es un objeto que contiene las urls (o patrones) que causaran que
 * un DevPower.Http.ResponseInterceptor almacene en disco el contenido de la respuesta
 */
DevPower.Http.ResponseInterceptor.UrlMatcher = function() {
	this.urls = [];
}

DevPower.Http.ResponseInterceptor.UrlMatcher.prototype = new DevPower.Http.ResponseInterceptor.Matcher();
DevPower.Http.ResponseInterceptor.UrlMatcher.prototype.constructor = DevPower.Http.ResponseInterceptor.UrlMatcher;
DevPower.Http.ResponseInterceptor.UrlMatcher.prototype.match = function(subject) {
	var url = subject.URI.spec;
	var intercept = false;

	for (var i in this.urls) {
		if (url.match(this.urls[i])) {
			intercept = true;
			break;
		}
	}

	return intercept;
}

DevPower.Http.ResponseInterceptor.UrlMatcher.prototype.addUrl = function(url) {
	this.urls.push(url);
}

/**
 * nsITraceableListener
 *
 * Esta clase se encarga de descargar y guardar en disco el contenido
 * de la respuesta.
 */
DevPower.Http.ResponseInterceptor.Downloader = function(downloadDir, fileExtension) {
	if (!downloadDir) {
		throw new Error("Falta especificar el directorio de descarga");
	}

	this.originalListener = null;
	this._downloadDir = downloadDir;
	this._fileExtension = fileExtension;
	this._stream = DevPower.Util.createInstance(
			"@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream");
}

DevPower.Http.ResponseInterceptor.Downloader.prototype = {

	onDataAvailable: function(request, context, inputStream, offset, count) {
		var binaryInputStream = DevPower.Util.createInstance(
				"@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
		var storageStream = DevPower.Util.createInstance(
				"@mozilla.org/storagestream;1", "nsIStorageStream");
		var binaryOutputStream = DevPower.Util.createInstance(
				"@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");

		binaryInputStream.setInputStream(inputStream);
        storageStream.init(8192, count, null);
	    binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

		var data = binaryInputStream.readBytes(count);
		this._stream.write(data, count);
	    binaryOutputStream.writeBytes(data, count);

        this.originalListener.onDataAvailable(request, context, storageStream.newInputStream(0), offset, count);
	},

	onStartRequest: function(request, context) {
		var filename = this.createFileName(request, context) + "." + this._fileExtension;
		var file = DevPower.Util.createInstance("@mozilla.org/file/local;1", "nsILocalFile");
		var suffix = "";
		var count = 1;

		do {
			file.initWithPath(this._downloadDir);
			file.appendRelativePath(filename + suffix);
			suffix = "." + count++;
		} while (file.exists());

		file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 420);
		this._stream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);

		this.originalListener.onStartRequest(request, context);
	},

	onStopRequest: function(request, context, statusCode) {
		this._stream.close();

		this.originalListener.onStopRequest(request, context, statusCode);
	},

	/**
	 * Genera un nombre de archivo aleatorio.
	 * Utiliza 2 partes, q son a su vez números aleatorios del
	 * 0 al 10000, así se reducen las probabilidades de que un
	 * nombre de archivo se repita.
	 */
	createFileName: function(request, context) {
		var part1 = Math.floor(Math.random() * 10000);
		var part2 = Math.floor(Math.random() * 10000);

		return part1 + part2;
	},

	QueryInterface: function (aIID) {
	    if (aIID.equals(Ci.nsIStreamListener) ||
		    aIID.equals(Ci.nsISupports)) {
		    return this;
		}
		
		throw Components.results.NS_NOINTERFACE;
	},
}

