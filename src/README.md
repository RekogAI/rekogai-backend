## List of API's

uploadImageToS3()

savePreUploadImageDetails(){
    generateImagePreSignedURL(){
        // details of the image {}, fileName, fileSize, fileMIMEType, etc...
        // store this details in DB and return a presigned url
        // create presigned url string
        // return ps url, imageId to frontend
    }
}

savePostUploadImageDetails(){
    // s3url etc...
}

<!-- Now image is uploaded to s3, and database -->
analyzeImages
create,save,update,detect,generateFaceCollection,  

detect face
save face to collection and database
create face albums
create face thumbnails

generateAlbums(){
    <!-- input object: s3 folder, userId -->
    fetchImages(limit=50){
    }
    processImages(){
        // call DetectFaces, SearchFacesByImage,  
    }
    saveProcessedImageResults(){
    }
    // check for next batch of images, if yes then repeat else exit the loop
}


image => rekognition => index faces() => 5 faces{
    externalImageId:"1234"
},


