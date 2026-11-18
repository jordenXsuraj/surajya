// A multer storage engine that streams each upload to Cloudinary (replaces multer-storage-cloudinary,
// which only supports cloudinary 1.x). Same result as before: req.file.path is the HTTPS URL,
// req.file.size the stored size and req.file.filename the public id (folder included).
class CloudinaryStorage {
  // params: an object, or (req, file) => object (may be async), passed to upload_stream as options
  constructor({ cloudinary, params = {} }) {
    if (!cloudinary) throw new Error('CloudinaryStorage needs a configured cloudinary.v2 instance')
    this.cloudinary = cloudinary
    this.params = params
  }

  _handleFile(req, file, cb) {
    Promise.resolve(typeof this.params === 'function' ? this.params(req, file) : this.params)
      .then(options => {
        const stream = this.cloudinary.uploader.upload_stream(options, (err, result) => {
          if (err) return cb(err)
          cb(null, {
            path:     result.secure_url,
            size:     result.bytes,
            filename: result.public_id,
            // kept so _removeFile can delete raw files (PDFs) too
            resourceType: result.resource_type ?? options.resource_type,
            width:  result.width,
            height: result.height,
          })
        })
        file.stream.pipe(stream)
      })
      .catch(cb)
  }

  // multer calls this when the request fails after the upload (e.g. a later file is refused)
  _removeFile(req, file, cb) {
    const options = { invalidate: true }
    if (file.resourceType) options.resource_type = file.resourceType
    const pending = this.cloudinary.uploader.destroy(file.filename, options, err => cb(err || null))
    pending?.catch?.(() => {}) // the callback already has the error
  }
}

module.exports = { CloudinaryStorage }
