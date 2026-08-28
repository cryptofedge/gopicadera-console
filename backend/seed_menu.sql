-- =====================================================================
--  Go Picadera - menu seed, generated from redesign/index.html
--  Regenerate with: node scripts/gen-seed.js  (do not hand-edit)
--  Idempotent: safe to run more than once.
-- =====================================================================

-- The storefront carries option behaviour the original schema had no
-- columns for. Without these the seed would silently drop the avocado
-- pricing and the picadera meat counts, and the console would show a
-- menu that does not match the site.
alter table products      add column if not exists keywords      text default '';
alter table products      add column if not exists is_picadera   boolean not null default false;
alter table products      add column if not exists is_party      boolean not null default false;
alter table option_groups add column if not exists qty           boolean not null default false;
alter table option_groups add column if not exists unit_price    numeric(10,2);
alter table option_groups add column if not exists stock_key     text;
alter table option_groups add column if not exists label_one_es  text;
alter table option_groups add column if not exists label_one_en  text;
alter table option_groups add column if not exists label_many_es text;
alter table option_groups add column if not exists label_many_en text;
alter table option_groups add column if not exists pick          int;
alter table option_groups add column if not exists default_idx   int;

-- ---------------------------------------------------------- categories
insert into categories (slug,name_es,name_en,sort) values ('empezar','Para Empezar','Starters',0)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('picaderas','Picaderas','Picaderas',1)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('mofongos','Mofongos','Mofongos',2)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('sandwiches','Sándwiches','Sandwiches',3)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('yaroas','Yaroas','Yaroas',4)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('ordenes','Órdenes','Plates',5)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('sides','Acompañantes','Sides',6)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('postres','Postres','Desserts',7)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;
insert into categories (slug,name_es,name_en,sort) values ('bebidas','Bebidas','Drinks',8)
  on conflict (slug) do update set name_es=excluded.name_es, name_en=excluded.name_en, sort=excluded.sort;

-- ------------------------------------------------------------ products
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='empezar'),'empanadas','Empanadas','Pollo, res, queso, pollo con queso, res con queso, jamón con queso o pizza.','Chicken, beef, cheese, chicken-cheese, beef-cheese, ham-cheese or pizza.',3,'assets/dishes/empanadas.jpg',0,null,'picadera frito pastelito',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='empezar'),'tresgolpes','Tres Golpes','Mangú, salami, queso, huevo y cebolla. Agrégale aguacate si quieres.','Mangú, salami, cheese, egg and onion. Add avocado if you like.',9.99,'assets/dishes/tresgolpes.jpg',1,5,'desayuno mangu breakfast salami',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='empezar'),'kipes','Kipes','De res. Crujientes por fuera, jugosos por dentro.','Beef. Crunchy outside, juicy inside.',3,'assets/dishes/kipes.jpg',2,null,'picadera kibbe frito quipe',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='picaderas'),'pic-personal','Picadera Personal','Para 1 persona. Elige 1 o 2 carnes + 1 acompañante.','Serves 1. Choose 1 or 2 meats + 1 side.',16.99,'assets/dishes/pic-personal.jpg',3,3,'picadera compartir tabla',true,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='picaderas'),'pic-small','Picadera Small','Para 2 personas. Elige 3 carnes + 1 acompañante.','Serves 2. Choose 3 meats + 1 side.',26.99,'assets/dishes/pic-small.jpg',4,null,'picadera compartir tabla',true,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='picaderas'),'pic-medium','Picadera Medium','Para 4 personas. Elige 5 carnes + 2 acompañantes.','Serves 4. Choose 5 meats + 2 sides.',49.99,'assets/dishes/pic-medium.jpg',5,null,'picadera compartir tabla fiesta',true,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='picaderas'),'pic-large','Picadera Large','Para 6 a 7 personas. Carnes mixtas + 2 acompañantes.','Serves 6 to 7. Mixed meats + 2 sides.',84.99,'assets/dishes/pic-large.jpg',6,null,'picadera compartir tabla fiesta',true,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='picaderas'),'pic-party','Picadera Party Size','Para 12 personas. Carnes mixtas + 2 acompañantes.','Serves 12. Mixed meats + 2 sides.',146.99,'assets/dishes/pic-party.jpg',7,null,'picadera fiesta party catering compartir tabla',true,true
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='mofongos'),'mofongo','Mofongo Tradicional','Elige chicharrón, pollo (pechurina o a la parrilla), res o camarón.','Choose chicharrón, chicken (tenders or grilled), beef or shrimp.',15.99,'assets/dishes/mofongo.jpg',8,null,'platano majado',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='mofongos'),'threefongo','Three-fongo','Elige chicharrón, pollo (pechurina o a la parrilla), res o camarón.','Choose chicharrón, chicken (tenders or grilled), beef or shrimp.',17.99,'assets/dishes/1783868022636-90e5d79d-1742-411e-9b85-4716c526ec34.jpg',9,null,'platano yuca maduro',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='mofongos'),'mofonguito','Mofonguitos','4 cazuelitas. Elige chicharrón, pollo (pechurina o a la parrilla), res o camarón.','4 cups. Choose chicharrón, chicken (tenders or grilled), beef or shrimp.',15.99,'assets/dishes/mofonguito.jpg',10,null,'platano cazuela',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'chimi','Dominican Chimi','Repollo, cebolla, ketchup, mayonesa, pan y tomate. Elige tu carne: pollo, res o pernil.','Cabbage, onion, ketchup, mayo, bread and tomato. Choose chicken, beef or pernil.',11.99,'assets/dishes/chimi.jpg',11,1,'chimichurri sandwich hamburguesa',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'tostada','Dominican Tostada','Jamón, queso, tomate, lechuga, cebolla, pan, mayonesa y ketchup.','Ham, cheese, tomato, lettuce, onion, bread, mayo and ketchup.',8.99,'assets/dishes/tostada.jpg',12,null,'sandwich jamon ham',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'hotdog','Dominican Hot Dog','Salchicha, repollo, maíz, carne molida, queso y salsas. Viene con papas.','Sausage, cabbage, corn, ground beef, cheese and sauces. Comes with fries.',11.99,'assets/dishes/hotdog.jpg',13,4,'perro caliente sausage salchicha',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'patacon','Patacón','Queso frito, tomate, lechuga, cebolla, ketchup y mayonesa entre dos plátanos verdes fritos. Elige pollo, res, camarón o pernil.','Fried cheese, tomato, lettuce, onion, ketchup and mayo between two fried green plantains. Choose chicken, beef, shrimp or pernil.',14.99,'assets/dishes/patacon.jpg',14,null,'platano sandwich',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'cheeseburger','Cheese Burger','Carne artesanal, queso, tomate, lechuga, cebolla, pan, ketchup y mayonesa. Viene con papas.','Homemade patty, cheese, tomato, lettuce, onion, bread, ketchup and mayo. Comes with fries.',14.99,'assets/dishes/cheeseburger.jpg',15,null,'hamburguesa burger queso',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'burger-beef','Special Burger Grilled Beef','Carne a la parrilla, queso, bacon, huevo, tomate, lechuga, cebolla, maduro frito, ketchup y salsas. Viene con papas.','Grilled beef patty, cheese, bacon, egg, tomato, lettuce, onion, sweet fried plantain, ketchup and sauces. Comes with fries.',16.99,'assets/dishes/burger-beef.jpg',16,2,'hamburguesa burger res beef',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'burger-chicken','Special Burger Grilled Chicken','Tiras de pollo a la parrilla, queso, bacon, huevo, tomate, lechuga, cebolla, maduro frito, ketchup y salsas. Viene con papas.','Grilled chicken strips, cheese, bacon, egg, tomato, lettuce, onion, sweet fried plantain, ketchup and sauces. Comes with fries.',16.99,'assets/dishes/burger-chicken.jpg',17,null,'hamburguesa burger pollo chicken',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sandwiches'),'clubsandwich','Club Sandwich','Pollo, jamón, queso, lechuga, tomate y salsas. Viene con papas.','Chicken, ham, cheese, lettuce, tomato and sauces. Comes with fries.',14.99,'assets/dishes/clubsandwich.jpg',18,null,'sandwich pollo jamon',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='yaroas'),'yaroa-fries','Yaroa de Papas','Con queso y salsas. Elige pollo, res, pernil o chicharrón. Carne extra $2.50.','With cheese and sauces. Choose chicken, beef, pernil or chicharrón. Extra meat $2.50.',13.99,'assets/dishes/yaroa-fries.jpg',19,null,'papas yaroa queso',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='yaroas'),'yaroa-sweet','Yaroa de Maduro','Con queso y salsas. Elige pollo, res, pernil o chicharrón. Carne extra $2.50.','With cheese and sauces. Choose chicken, beef, pernil or chicharrón. Extra meat $2.50.',14.99,'assets/dishes/1783870849645-765ebf61-0004-458b-982b-adbc54deddf9.jpg',20,null,'maduro yaroa queso',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='yaroas'),'salchipapa','Salchipapa','Papas fritas con salchicha, queso y salsas.','Fries with sausage, cheese and sauces.',11.99,'assets/dishes/salchipapa.jpg',21,6,'papas salchicha',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'picapollo','Pica Pollo','4 piezas + 1 acompañante.','4 pieces + 1 side.',14.99,'assets/dishes/picapollo.jpg',22,null,'pollo frito chicken fried',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'pechurina','Pechurina','Tiras de pollo + 1 acompañante.','Chicken tenders + 1 side.',14.99,'assets/dishes/pechurina.jpg',23,null,'pollo tenders chicken',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'alitas','Alitas','8 alitas. Elige original, BBQ o buffalo. Viene con papas.','8 wings. Choose original, BBQ or buffalo. Comes with fries.',14.99,'assets/dishes/alitas.jpg',24,null,'wings alitas pollo buffalo bbq',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'pechuga','Pechuga a la Parrilla','Pechuga de pollo a la parrilla + 1 acompañante.','Grilled chicken breast + 1 side.',16.99,'assets/dishes/pechuga.jpg',25,null,'pollo parrilla grilled chicken breast',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'shrimp','Camarones','Camarones + 1 acompañante. Elige a la parrilla, al ajillo o crispy.','Shrimp + 1 side. Choose grilled, garlic or crispy.',17.99,'assets/dishes/shrimp.jpg',26,null,'camarones mariscos shrimp seafood',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='ordenes'),'tacos','Tacos','3 tortillas suaves con cebolla y cilantro. Elige pollo, res, camarón, chicharrón, longaniza u orejita.','3 soft tortillas with onion and cilantro. Choose chicken, beef, shrimp, chicharrón, longaniza or orejita.',12.99,'assets/dishes/tacos.jpg',27,null,'taco tortilla',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sides'),'fries','Papas Fritas','','',4.99,'assets/dishes/1783873560058-74544316-933b-4463-8c20-ee986fd370cc.jpg',28,null,'papas fritas french fries',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sides'),'tostones','Tostones','','',5.99,'assets/dishes/1783873688815-612db2c8-8394-4f72-80e9-a66cddb066d4.jpg',29,null,'platano frito verde',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sides'),'yuca','Yuca Frita','','',6.99,'assets/dishes/1783873703067-282e9057-6ec6-41b1-88fe-8138e4d1eb5a.jpg',30,null,'casava frita',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sides'),'maduros','Maduros','Plátano maduro frito.','Fried sweet plantain.',6.99,'assets/dishes/maduros.jpg',31,null,'platano maduro sweet plantain',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='sides'),'batata','Batata','','',7.99,'assets/dishes/1783872053010-6836437e-4704-42fa-b95e-870f2e448c74.jpg',32,null,'boniato sweet potato',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='postres'),'tresleche','Tres Leche','','',5.99,'assets/dishes/tresleche.jpg',33,null,'postre dessert cake bizcocho',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'chinola','Jugo de Chinola','Jugo natural de maracuyá.','Fresh passion fruit juice.',6,'assets/dishes/chinola.jpg',34,null,'jugo juice maracuya passion',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'limon','Jugo de Limón','Limonada natural.','Fresh lemonade.',6,'assets/dishes/limon.jpg',35,null,'jugo juice lemonade limonada',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'tamarindo','Jugo de Tamarindo','Jugo natural de tamarindo.','Fresh tamarind juice.',7,'assets/dishes/tamarindo.jpg',36,null,'jugo juice',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'morir','Morir Soñando','Jugo de naranja con leche, el clásico dominicano.','Orange juice and milk — the Dominican classic.',7,'assets/dishes/morir.jpg',37,null,'jugo naranja leche juice orange',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'water','Agua','','',1.5,'assets/dishes/1783876026623-c2908c81-5da9-4ecc-a33d-cfda1d33acca.jpg',38,null,'agua bebida drink',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'soda','Refresco','','',2,'assets/dishes/1783875995438-03351f88-de10-4f77-88aa-f9164bdc670d.jpg',39,null,'refresco bebida drink coca cola',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'countryclub','Country Club','Refresco dominicano.','Dominican soda.',3,'assets/dishes/countryclub.jpg',40,null,'refresco soda dominicana',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;
insert into products (category_id,slug,name,desc_es,desc_en,price,image_path,sort,featured,keywords,is_picadera,is_party) values (
  (select id from categories where slug='bebidas'),'jarrito','Jarrito','Refresco mexicano de sabores.','Mexican fruit soda.',3,'assets/dishes/jarrito.jpg',41,null,'refresco soda mexicano',false,false
)  on conflict (slug) do update set category_id=excluded.category_id, name=excluded.name,
     desc_es=excluded.desc_es, desc_en=excluded.desc_en, price=excluded.price,
     image_path=excluded.image_path, sort=excluded.sort, featured=excluded.featured,
     keywords=excluded.keywords, is_picadera=excluded.is_picadera, is_party=excluded.is_party;

-- ------------------------------------------- option groups and choices
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'relleno','Relleno','Filling',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='empanadas'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='relleno');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso','Cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo con queso','Chicken & cheese',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res con queso','Beef & cheese',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Jamón y queso','Ham & cheese',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Jamón y queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pizza','Pizza',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='empanadas' and o.key='relleno'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pizza');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'aguacate','Aguacate','Avocado',0,true,4,'Aguacate','aguacate','avocado','aguacates','avocados',null,null
  from products p where p.slug='tresgolpes'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='aguacate');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carnes','Carnes','Meats',0,false,null,null,null,null,null,null,2,null
  from products p where p.slug='pic-personal'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carnes');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso frito','Fried cheese',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso frito');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salami','Salami',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salami');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de pollo con queso','Chicken chicharrón with cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pechuga a la parrilla','Grilled chicken breast',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pechuga a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de res salada','Salted beef',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de res salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de cerdo salada','Salted pork',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de cerdo salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chuleta ahumada','Smoked chop',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chuleta ahumada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de cerdo','Pork chicharrón',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de cerdo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buche','Buche',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buche');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salchicha argentina','Argentine sausage',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salchicha argentina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Morcilla','Morcilla',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Morcilla');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pic-personal'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-personal' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carnes','Carnes','Meats',0,false,null,null,null,null,null,null,3,null
  from products p where p.slug='pic-small'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carnes');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso frito','Fried cheese',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso frito');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salami','Salami',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salami');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de pollo con queso','Chicken chicharrón with cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pechuga a la parrilla','Grilled chicken breast',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pechuga a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de res salada','Salted beef',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de res salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de cerdo salada','Salted pork',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de cerdo salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chuleta ahumada','Smoked chop',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chuleta ahumada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de cerdo','Pork chicharrón',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de cerdo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buche','Buche',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buche');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salchicha argentina','Argentine sausage',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salchicha argentina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Morcilla','Morcilla',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Morcilla');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pic-small'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-small' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carnes','Carnes','Meats',0,false,null,null,null,null,null,null,5,null
  from products p where p.slug='pic-medium'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carnes');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso frito','Fried cheese',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso frito');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salami','Salami',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salami');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de pollo con queso','Chicken chicharrón with cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pechuga a la parrilla','Grilled chicken breast',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pechuga a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de res salada','Salted beef',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de res salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de cerdo salada','Salted pork',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de cerdo salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chuleta ahumada','Smoked chop',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chuleta ahumada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de cerdo','Pork chicharrón',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de cerdo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buche','Buche',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buche');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salchicha argentina','Argentine sausage',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salchicha argentina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Morcilla','Morcilla',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Morcilla');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pic-medium'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side2','Segundo acompañante','Second side',2,false,null,null,null,null,null,null,null,1
  from products p where p.slug='pic-medium'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side2');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-medium' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carnes','Carnes','Meats',0,false,null,null,null,null,null,null,7,null
  from products p where p.slug='pic-large'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carnes');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso frito','Fried cheese',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso frito');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salami','Salami',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salami');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de pollo con queso','Chicken chicharrón with cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pechuga a la parrilla','Grilled chicken breast',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pechuga a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de res salada','Salted beef',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de res salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de cerdo salada','Salted pork',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de cerdo salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chuleta ahumada','Smoked chop',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chuleta ahumada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de cerdo','Pork chicharrón',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de cerdo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buche','Buche',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buche');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salchicha argentina','Argentine sausage',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salchicha argentina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Morcilla','Morcilla',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Morcilla');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pic-large'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side2','Segundo acompañante','Second side',2,false,null,null,null,null,null,null,null,1
  from products p where p.slug='pic-large'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side2');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-large' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carnes','Carnes','Meats',0,false,null,null,null,null,null,null,9,null
  from products p where p.slug='pic-party'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carnes');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Queso frito','Fried cheese',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Queso frito');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salami','Salami',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salami');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de pollo con queso','Chicken chicharrón with cheese',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de pollo con queso');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pechuga a la parrilla','Grilled chicken breast',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pechuga a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de res salada','Salted beef',2,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de res salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Carne de cerdo salada','Salted pork',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Carne de cerdo salada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chuleta ahumada','Smoked chop',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chuleta ahumada');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón de cerdo','Pork chicharrón',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón de cerdo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buche','Buche',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buche');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Salchicha argentina','Argentine sausage',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Salchicha argentina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Morcilla','Morcilla',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='carnes'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Morcilla');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pic-party'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side2','Segundo acompañante','Second side',2,false,null,null,null,null,null,null,null,1
  from products p where p.slug='pic-party'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side2');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pic-party' and o.key='side2'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='mofongo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo (pechurina)','Chicken (tenders)',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo (pechurina)');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo a la parrilla','Grilled chicken',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Camarón','Shrimp',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Camarón');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'extra','Carne extra','Extra meat',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='mofongo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='extra');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'No, gracias','No thanks',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='No, gracias');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Con carne extra','With extra meat',2.5,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofongo' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Con carne extra');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='threefongo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo (pechurina)','Chicken (tenders)',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo (pechurina)');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo a la parrilla','Grilled chicken',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Camarón','Shrimp',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Camarón');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'extra','Carne extra','Extra meat',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='threefongo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='extra');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'No, gracias','No thanks',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='No, gracias');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Con carne extra','With extra meat',2.5,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='threefongo' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Con carne extra');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='mofonguito'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo (pechurina)','Chicken (tenders)',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo (pechurina)');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo a la parrilla','Grilled chicken',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo a la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Camarón','Shrimp',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Camarón');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'extra','Carne extra','Extra meat',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='mofonguito'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='extra');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'No, gracias','No thanks',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='No, gracias');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Con carne extra','With extra meat',2.5,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='mofonguito' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Con carne extra');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='chimi'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chimi' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chimi' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pernil','Pernil',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chimi' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pernil');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='patacon'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='patacon' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='patacon' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Camarón','Shrimp',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='patacon' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Camarón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pernil','Pernil',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='patacon' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pernil');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='yaroa-fries'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pernil','Pernil',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pernil');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'extra','Carne extra','Extra meat',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='yaroa-fries'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='extra');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'No, gracias','No thanks',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='No, gracias');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Con carne extra','With extra meat',2.5,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-fries' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Con carne extra');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='yaroa-sweet'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pernil','Pernil',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pernil');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'extra','Carne extra','Extra meat',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='yaroa-sweet'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='extra');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'No, gracias','No thanks',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='No, gracias');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Con carne extra','With extra meat',2.5,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='yaroa-sweet' and o.key='extra'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Con carne extra');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='picapollo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='picapollo' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='picapollo' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='picapollo' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='picapollo' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='picapollo' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pechurina'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechurina' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechurina' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechurina' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechurina' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechurina' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'salsa','Salsa','Sauce',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='alitas'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='salsa');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Original','Original',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='alitas' and o.key='salsa'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Original');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'BBQ','BBQ',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='alitas' and o.key='salsa'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='BBQ');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Buffalo','Buffalo',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='alitas' and o.key='salsa'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Buffalo');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='pechuga'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechuga' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechuga' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechuga' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechuga' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='pechuga' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'prep','Preparación','Preparation',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='shrimp'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='prep');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'A la parrilla','Grilled',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='prep'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='A la parrilla');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Al ajillo','Garlic',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='prep'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Al ajillo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Crispy','Crispy',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='prep'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Crispy');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'side','Acompañante','Side',1,false,null,null,null,null,null,null,null,null
  from products p where p.slug='shrimp'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='side');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Papas fritas','French fries',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Papas fritas');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tostones','Tostones',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tostones');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Maduros','Sweet plantain',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Maduros');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Yuca frita','Fried yuca',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Yuca frita');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Batata','Batata',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='shrimp' and o.key='side'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Batata');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'carne','Carne','Meat',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='tacos'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='carne');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pollo','Chicken',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pollo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Res','Beef',2,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Res');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Camarón','Shrimp',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Camarón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Chicharrón','Chicharrón',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Chicharrón');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Longaniza','Longaniza',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Longaniza');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Orejita','Orejita',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tacos' and o.key='carne'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Orejita');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'azucar','Azúcar','Sugar',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='chinola'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='azucar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Normal','Regular',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chinola' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Normal');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Poca azúcar','Less sugar',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chinola' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Poca azúcar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sin azúcar','No sugar',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='chinola' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sin azúcar');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'azucar','Azúcar','Sugar',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='limon'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='azucar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Normal','Regular',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='limon' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Normal');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Poca azúcar','Less sugar',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='limon' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Poca azúcar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sin azúcar','No sugar',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='limon' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sin azúcar');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'azucar','Azúcar','Sugar',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='tamarindo'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='azucar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Normal','Regular',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tamarindo' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Normal');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Poca azúcar','Less sugar',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tamarindo' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Poca azúcar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sin azúcar','No sugar',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='tamarindo' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sin azúcar');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'azucar','Azúcar','Sugar',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='morir'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='azucar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Normal','Regular',0,true,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='morir' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Normal');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Poca azúcar','Less sugar',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='morir' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Poca azúcar');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sin azúcar','No sugar',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='morir' and o.key='azucar'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sin azúcar');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'sabor','Sabor','Flavor',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='soda'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='sabor');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Coca-Cola','Coca-Cola',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Coca-Cola');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Coca-Cola Zero','Coke Zero',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Coca-Cola Zero');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Coca-Cola Diet','Diet Coke',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Coca-Cola Diet');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pepsi','Pepsi',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pepsi');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Pepsi Diet','Diet Pepsi',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Pepsi Diet');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sprite','Sprite',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sprite');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'7UP','7UP',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='7UP');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Fanta de naranja','Orange Fanta',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Fanta de naranja');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Fanta de uva','Grape Fanta',0,false,8
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Fanta de uva');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Sunkist','Sunkist',0,false,9
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Sunkist');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Dr Pepper','Dr Pepper',0,false,10
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Dr Pepper');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Mountain Dew','Mountain Dew',0,false,11
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Mountain Dew');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Ginger Ale','Ginger Ale',0,false,12
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Ginger Ale');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Root Beer','Root Beer',0,false,13
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Root Beer');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Malta Morena','Malta Morena',0,false,14
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Malta Morena');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Malta India','Malta India',0,false,15
  from option_groups o join products p on p.id=o.product_id
  where p.slug='soda' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Malta India');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'sabor','Sabor','Flavor',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='countryclub'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='sabor');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Frambuesa','Raspberry',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Frambuesa');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Merengue','Merengue',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Merengue');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Uva','Grape',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Uva');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Naranja','Orange',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Naranja');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Manzana verde','Green apple',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Manzana verde');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Piña','Pineapple',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='countryclub' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Piña');
insert into option_groups (product_id,key,label_es,label_en,sort,qty,unit_price,stock_key,label_one_es,label_one_en,label_many_es,label_many_en,pick,default_idx)
  select p.id,'sabor','Sabor','Flavor',0,false,null,null,null,null,null,null,null,null
  from products p where p.slug='jarrito'
  and not exists (select 1 from option_groups o where o.product_id=p.id and o.key='sabor');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Mandarina','Mandarin',0,false,0
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Mandarina');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Toronja','Grapefruit',0,false,1
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Toronja');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Piña','Pineapple',0,false,2
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Piña');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Tamarindo','Tamarind',0,false,3
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Tamarindo');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Guayaba','Guava',0,false,4
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Guayaba');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Mango','Mango',0,false,5
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Mango');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Lima','Lime',0,false,6
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Lima');
insert into option_choices (group_id,label_es,label_en,price_delta,quiet,sort)
  select o.id,'Fresa','Strawberry',0,false,7
  from option_groups o join products p on p.id=o.product_id
  where p.slug='jarrito' and o.key='sabor'
  and not exists (select 1 from option_choices x where x.group_id=o.id and x.label_es='Fresa');
