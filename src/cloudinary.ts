import { v2 as cloudinaryRef } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinaryRef.config({ 
        secure: true,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET
});


export const uploadImageToCloudinary = async (fileBuffer: Buffer, id: string) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinaryRef.uploader.upload_stream({
            use_filename: true,
            folder: 'officer_images',
            public_id: `officer_${id}`,
            overwrite: true,
        }, (error, result) => {
            if(error) {
                console.error("Cloudinary upload error:", error);
                reject(error);
            }else {
                resolve(result);
            }
        })

        uploadStream.end(fileBuffer);
    })
}

// (async function() {

//     // Upload an image
//      const uploadResult = await cloudinary.uploader
//        .upload(
//            'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', {
//                public_id: 'shoes',
//            }
//        )
//        .catch((error) => {
//            console.log(error);
//        });
    
//     console.log(uploadResult);
    
//     // Optimize delivery by resizing and applying auto-format and auto-quality
//     const optimizeUrl = cloudinary.url('shoes', {
//         fetch_format: 'auto',
//         quality: 'auto'
//     });
    
//     console.log(optimizeUrl);
    
//     // Transform the image: auto-crop to square aspect_ratio
//     const autoCropUrl = cloudinary.url('shoes', {
//         crop: 'auto',
//         gravity: 'auto',
//         width: 500,
//         height: 500,
//     });
    
//     console.log(autoCropUrl);    
// })();