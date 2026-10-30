// Descarga las portadas de mangas y novelas a img/<producto>-frente.<ext>.  Uso: node tools/portadas.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'img');
const slug = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PORTADAS = {
  'Jujutsu Kaisen Vol. 20': 'https://m.media-amazon.com/images/I/81+-9sRp2JL._AC_UF1000,1000_QL80_.jpg',
  'Kaiju No. 8 Vol. 5': 'https://i5.walmartimages.com/seo/Kaiju-No-8-Vol-5-Paperback_35635763-dfaa-4a33-8a36-45f9fdfcaaa0.a96ae57c7a0a77b4157d6f0a16793ab9.jpeg',
  'Blue Lock Vol. 12': 'https://m.media-amazon.com/images/I/91mby+iia0L._UF1000,1000_QL80_.jpg',
  'Dandadan Vol. 7': 'https://m.media-amazon.com/images/I/81jPgY8ghpL._SL1500_.jpg',
  'Oshi no Ko Vol. 9': 'https://m.media-amazon.com/images/I/81IFvox+8-L._AC_UF1000,1000_QL80_.jpg',
  'Sakamoto Days Vol. 6': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQEZD8AiztMxVFxs__QKP4ZsebYDlc1k4nHocgC_8FAmen4QNTR5pqJV4yZ&s=10',
  'One Piece Vol. 108': 'https://static.wikia.nocookie.net/onepiece/images/f/f5/Volumen_108.png/revision/latest?cb=20240219034924&path-prefix=es',
  'Chanto Sukitte Ieru Ko Musou Vol. 1': 'https://m.media-amazon.com/images/I/81Fo0wHVoDL.jpg',
  'Go Toubun no Hanayome Vol. 3': 'https://static.wikia.nocookie.net/go-toubun-no-hanayome/images/4/48/5Toubun_no_Hanayome_Volumen_3.jpg/revision/latest?cb=20190901200232&path-prefix=es',
  'Go Toubun no Hanayome Vol. 8': 'https://static.wikia.nocookie.net/go-toubun-no-hanayome/images/d/d4/5Toubun_no_Hanayome_Volumen_8.jpg/revision/latest/scale-to-width-down/1200?cb=20190907065757&path-prefix=es',
  'Spy × Family Vol. 9': 'https://m.media-amazon.com/images/I/81LnhikYRlL._SL1500_.jpg',
  'Frieren Vol. 7': 'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1661086125i/61273636.jpg',
  'Watashi o Tabetai, Hitodenashi Vol. 1': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgMbu5cGJbpKylq4MK96MkSdJ6YKva3S8cqiiRex4nGFDmuDaGKFg3fwE&s=10',
  'Uma Musume: Cinderella Gray Vol. 21': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTU3QBxWCICCL7bgWGqQFo6QI5hb5PNSR8wQpD-2idWXW5BEJHGZBAP54Cl&s=10',
  'Black Clover Vol. 37': 'https://d28hgpri8am2if.cloudfront.net/book_images/onix/cvr9781974716722/black-clover-vol-37-9781974716722_hr.jpg',
  'Oshi no Ko Vol. 11': 'https://m.media-amazon.com/images/I/61WWRIZkYnL._AC_UF1000,1000_QL80_.jpg',
  'Sakamoto Days Vol. 7': 'https://i5.walmartimages.com/seo/Sakamoto-Days-Sakamoto-Days-Vol-7-Series-7-Paperback-9781974736805_90d9034f-3c61-488b-ba73-7d30fee2d65c.5eac7907f1d2c1be66b4970f8acc7eea.jpeg',
  'Vinland Saga Vol. 27': 'https://www.planetadelibros.com/usuaris/libros/thumbs/307c3ec4-1313-4e2f-a00d-7e3180d6874d/d_1200_1200/portada_vinland-saga-n-27_makoto-yukimura_202403011213.webp',
  'Berserk Vol. 42': 'https://m.media-amazon.com/images/I/613kkvOb-VL._AC_UF1000,1000_QL80_.jpg',
  'Haikyu!! Vol. 45': 'https://images.cdn1.buscalibre.com/fit-in/360x360/2d/d2/2dd2286be953b2732aa3cf74095d546d.jpg',
  'My Hero Academia Vol. 40': 'https://images.cdn3.buscalibre.com/fit-in/660x660/9e/64/9e64f5778ebe82017b325f380f75ced7.jpg',
  'Witch Hat Atelier Vol. 12': 'https://production.image.azuki.co/262f5d9e-0c5f-4588-9b34-c49f7836c4a9/800.webp',
  'Sword Art Online Vol. 3': 'https://m.media-amazon.com/images/I/813GzMTtMqL._AC_UF1000,1000_QL80_.jpg',
  'Re:Zero Vol. 10': 'https://m.media-amazon.com/images/I/91Zdt-8PTPL._UF1000,1000_QL80_.jpg',
  'Overlord Vol. 12': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVemaxHWoa9CyO9Z4uWtqcGxxes77RazMnR_EmsfLbeA&s=10',
  'No Game No Life Vol. 6': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWMbjQgjO4LqO7kqwJzoSxVzXQW-9b7hPFr1xhq9ZoMQ&s=10',
  'Spice and Wolf Vol. 8': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjt7_5N-SQ_vk3kXYSBtxPvDH5JI9X5LYJNYvXJQXWxw&s=10',
  'KonoSuba Vol. 4': 'https://i5.walmartimages.com/seo/Konosuba-light-novel-Konosuba-God-s-Blessing-Wonderful-World-Vol-4-light-novel-You-Good-for-Nothing-Quartet-Series-4-Paperback_70f49581-fc28-437a-8fd4-63eb1f9a74e0.221f5216858fffbcbdc6c3c6870f5e4d.jpeg',
  'Jinsei Gyakuten Uwaki sare, Enzai wo Kiserareta Ore ga, Gakuen Ichi no Bishoujo ni Natsukareru Vol. 2': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTdB0y9Jq1S3nJnR5YlrlbJpFdQUH6SW75VaRKcyqerR-CpYDuSQqzDNKI&s=10',
  'Re:Zero Vol. 11': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGeRCiU0ANxUzT8uJZHRFyPk3wZOnJjlE3W8sAf8ec5g&s=10',
  'Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san Vol. 7': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoUny4uerrCPcTZzLnRC-RGS-xhHksdjt_mZXes9LyhQ&s=10',
  '86 Eighty Six Vol. 4': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSe_F301b3fCfcCRFoKBUob1Q6RBtvJlitnhjSN41HRgg&s=10',
  'Goblin Slayer Vol. 10': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR2PMtId_ftXvCsq5O1UWL1lmZmXPjafLckPJ-ePbD-pQ&s=10',
  'Black Bullet Vol. 7': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZC5s6WZ4VNxPijRvggxoUylhupBmDQrajkN51uxwlow&s=10',
  'KonoSuba Vol. 5': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSI5n3DtxiGjXM3TRLWNNokwm5zLoV51suAPeFcbmPx2w&s=10',
  'Youkoso Jitsuryoku Vol. 28': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTf04tgm-3tbO-dZuUFdnlS5Dsmv2MBaZVxsFNVh_AAzA&s=10',
  'Magical Detective Kurumi Tokisaki Vol. 3': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQI_2d1kjyfYBehxW1maidq2tFK3yQOGErdUzx3lfpXmw&s=10',
  'Mushoku Tensei Vol. 8': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR-BxLXgJfsWD53txfnBYGxoEPEKQ65JlmQ7X3admHFBg&s=10',
  'Tensei shitara Slime Datta Ken Vol. 19': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTdVyulBoalzJBMwfbPCS2BScCkn-SaMsrQDsAHI_H-Ng&s=10',
  'Make Heroine ga Oosugiru! Vol. 9': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8p85ORMwJG4L25AtuM4NjjP4VdW-S96WIhcmSXVxYiQ&s=10',
  'Rakudai Kishi no Cavalry Vol. 19': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8ZzIBHpFtJtC12lin63nKZcik7nTjLW5QXCMwCfhdHg&s=10',
  'Yahari Ore no Seishun Rabukome wa Machigatte Iru Vol. 17': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSr90JJNSbnoW8vnSLNDiqkWYrKhi_pp5O-FRXOYSifpg&s=10',
  'Shibou End o Kaihi Shita Gyaruge no Heroine Vol. 2': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ5IUPPdm8P9zf6JqHYJtzwy2_NWwVQLW8aHwo455T5Tg&s=10',
  'Nageki no Bourei wa Intai Shitai Vol. 8': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSop1yWcbVLQ5xZmTTZI0wBBNp2FwtvO94Std7f62Q6w&s=10',
};

const tipo = b => b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : b.slice(8, 12).toString() === 'WEBP' ? 'webp' : null;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0;
  for (const [nombre, url] of Object.entries(PORTADAS)) {
    const base = slug(nombre) + '-frente';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' } });
      const b = Buffer.from(await r.arrayBuffer()), ext = tipo(b);
      if (!r.ok || !ext) throw new Error(`HTTP ${r.status}, no es una imagen`);
      for (const e of ['jpg', 'png', 'webp']) fs.rmSync(path.join(OUT, `${base}.${e}`), { force: true });
      fs.writeFileSync(path.join(OUT, `${base}.${ext}`), b); ok++;
      console.log(`✓ ${nombre} (${Math.round(b.length / 1024)} KB)`);
    } catch (e) { console.log(`✗ ${nombre}: ${e.message}`); }
  }
  console.log(`Listo: ${ok}/${Object.keys(PORTADAS).length} portadas en img/.`);
})();
