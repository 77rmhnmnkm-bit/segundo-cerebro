alter table drugs add column if not exists max_absolute_mg numeric;

update drugs set max_absolute_mg = 300 where name = 'Lidocaína 2% com epinefrina 1:100.000' and max_absolute_mg is null;
update drugs set max_absolute_mg = 300 where name = 'Mepivacaína 3% sem vasoconstritor' and max_absolute_mg is null;
update drugs set max_absolute_mg = 500 where name = 'Articaína 4% com epinefrina 1:100.000' and max_absolute_mg is null;
update drugs set max_absolute_mg = 400 where name = 'Prilocaína 3% com felipressina' and max_absolute_mg is null;
